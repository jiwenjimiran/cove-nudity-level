using System.Collections;
using System.Text.Json;
using Cove.Core.Auth;
using Cove.Core.Entities;
using Cove.Core.Interfaces;
using Cove.Data;
using Cove.Plugins;
using Microsoft.AspNetCore.Http;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Metadata;
using Microsoft.Extensions.DependencyInjection;

namespace Cove.NudityLevel;

public static class NudityFilterMiddleware
{
    public static string[] Parse(JsonElement criterion)
    {
        if (criterion.ValueKind != JsonValueKind.Object || !criterion.TryGetProperty("value", out var value) || value.ValueKind != JsonValueKind.String)
            throw new ArgumentException("Select one or more nudity levels.");
        if (criterion.TryGetProperty("modifier", out var modifier) && (modifier.ValueKind != JsonValueKind.String || !string.Equals(modifier.GetString(), "equals", StringComparison.OrdinalIgnoreCase)))
            throw new ArgumentException("Nudity level supports only EQUALS.");
        var levels = value.GetString()!.Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).Distinct().ToArray();
        if (levels.Any(level => !NuditySettings.Levels.Contains(level))) throw new ArgumentException("Unknown nudity level.");
        return levels;
    }
    public static bool ContainsCriterion(JsonElement node) => node.ValueKind switch {
        JsonValueKind.Object => node.EnumerateObject().Any(p => p.Name.Equals(NudityLevelExtension.FilterKey, StringComparison.OrdinalIgnoreCase) || ContainsCriterion(p.Value)),
        JsonValueKind.Array => node.EnumerateArray().Any(ContainsCriterion), _ => false
    };
    public static async Task InvokeAsync(HttpContext http, RequestDelegate next)
    {
        var path = http.Request.Path.Value?.Trim('/').Split('/') ?? [];
        if (!HttpMethods.IsPost(http.Request.Method) || path.Length != 3 || path[0] != "api" || path[1] is not ("videos" or "images") || path[2] is not ("find" or "aggregate")) {
            await next(http); return;
        }
        http.Request.EnableBuffering();
        JsonDocument doc;
        try { doc = await JsonDocument.ParseAsync(http.Request.Body, cancellationToken: http.RequestAborted); }
        catch (JsonException) { http.Request.Body.Position = 0; await next(http); return; }
        http.Request.Body.Position = 0;
        using (doc) {
            if (doc.RootElement.ValueKind != JsonValueKind.Object) { await next(http); return; }
            if (doc.RootElement.TryGetProperty("filterExpression", out var expression) && ContainsCriterion(expression)) {
                await Error(http, "Apply Nudity level as a top-level filter. Cove 1.5.1 cannot apply it inside a condition group."); return;
            }
            if (!doc.RootElement.TryGetProperty("objectFilter", out var filter) || filter.ValueKind != JsonValueKind.Object || !filter.TryGetProperty(NudityLevelExtension.FilterKey, out var criterion)) {
                await next(http); return;
            }
            string[] levels;
            try { levels = Parse(criterion); } catch (ArgumentException ex) { await Error(http, ex.Message); return; }
            if (levels.Length == 0) { await next(http); return; }
            var endpoint = http.GetEndpoint();
            if (endpoint?.RequestDelegate is null) { await Error(http, "Nudity level requires a Cove list endpoint."); return; }
            var kind = path[1] == "videos" ? "video" : "image";
            // Run after host authentication; retain the original endpoint's authorization metadata.
            http.SetEndpoint(new Endpoint(async context => {
                var services = context.RequestServices;
                var principal = services.GetRequiredService<ICurrentPrincipalAccessor>();
                if (principal.Current is null || new[] { kind + "s.read", Permissions.TagsRead, Permissions.AiRunsRead }.Any(p => !principal.Current.Has(p))) {
                    context.Response.StatusCode = principal.Current is null ? 401 : 403;
                    await context.Response.WriteAsJsonAsync(new { message = "Nudity level requires media, tags, and AI run read permissions." }, context.RequestAborted); return;
                }
                var db = services.GetRequiredService<CoveContext>();
                var store = services.GetRequiredService<IExtensionStoreFactory>().CreateStore(NudityLevelExtension.ExtensionId);
                var settings = await SettingsStore.ResolveAsync(db, await SettingsStore.LoadAsync(store, context.RequestAborted), context.RequestAborted);
                var matches = await MatchingIdsAsync(db, kind, levels, settings, context.RequestAborted);
                var options = new DbContextOptionsBuilder<CoveContext>((DbContextOptions<CoveContext>)db.GetService<IDbContextOptions>()).UseModel(db.Model).Options;
                await using var narrowed = new NudityReadContext(options, principal, db, kind, matches);
                context.RequestServices = new NudityReadServices(services, narrowed, kind);
                try { await endpoint.RequestDelegate(context); } finally { context.RequestServices = services; }
            }, endpoint.Metadata, endpoint.DisplayName));
            await next(http);
        }
    }
    public static async Task<int[]> MatchingIdsAsync(CoveContext db, string kind, string[] levels, NuditySettings settings, CancellationToken ct = default)
    {
        var matches = new List<int>();
        var query = kind == "video" ? db.Videos.Select(v => v.Id) : db.Images.Select(i => i.Id);
        var last = 0;
        while (true) {
            var ids = await query.Where(id => id > last).Order().Take(500).ToArrayAsync(ct);
            if (ids.Length == 0) break;
            var classifications = await Classification.LoadAsync(db, kind, ids, settings, ct);
            matches.AddRange(ids.Where(id => levels.Contains(classifications[id])));
            last = ids[^1];
        }
        return matches.ToArray();
    }
    private static async Task Error(HttpContext http, string message) {
        http.Response.StatusCode = 400;
        await http.Response.WriteAsJsonAsync(new { message }, http.RequestAborted);
    }
}

// Preserve the source context's query restrictions, including another extension's narrowing.
public sealed class NudityReadContext(DbContextOptions<CoveContext> options, ICurrentPrincipalAccessor principal, CoveContext source, string kind, int[] ids)
    : CoveContext(options, principal)
{
    public override DbSet<T> Set<T>() {
        var original = source is null ? base.Set<T>() : source.Set<T>();
        var target = kind == "video" ? typeof(Video) : typeof(Image);
        return typeof(T) == target ? new NudityReadSet<T>(original, original.Where(e => ids.Contains(EF.Property<int>(e, "Id")))) : original;
    }
}
sealed class NudityReadSet<T>(DbSet<T> original, IQueryable<T> query) : DbSet<T>, IQueryable<T>, IAsyncEnumerable<T>, IInfrastructure<IServiceProvider> where T : class
{
    public override IEntityType EntityType => original.EntityType;
    Type IQueryable.ElementType => typeof(T);
    System.Linq.Expressions.Expression IQueryable.Expression => query.Expression;
    IQueryProvider IQueryable.Provider => query.Provider;
    IEnumerator<T> IEnumerable<T>.GetEnumerator() => query.GetEnumerator();
    IEnumerator IEnumerable.GetEnumerator() => query.GetEnumerator();
    public override IAsyncEnumerator<T> GetAsyncEnumerator(CancellationToken ct = default) => query.AsAsyncEnumerable().GetAsyncEnumerator(ct);
    IServiceProvider IInfrastructure<IServiceProvider>.Instance => ((IInfrastructure<IServiceProvider>)original).Instance;
}
sealed class NudityReadServices(IServiceProvider original, CoveContext context, string kind) : IServiceProvider
{
    private readonly Dictionary<Type, object> repositories = [];
    public object? GetService(Type type) {
        if (type == typeof(IServiceProvider)) return this;
        if (type == typeof(CoveContext)) return context;
        var repository = kind == "video" ? typeof(IVideoRepository) : typeof(IImageRepository);
        if (type != repository) return original.GetService(type);
        if (!repositories.TryGetValue(type, out var value)) {
            value = ActivatorUtilities.CreateInstance(this, original.GetRequiredService(type).GetType());
            repositories[type] = value;
        }
        return value;
    }
}

using Cove.Core.Auth;
using Cove.Data;
using Cove.Plugins;
using Cove.Sdk;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;

namespace Cove.NudityLevel;

public sealed class NudityLevelExtension : FullExtensionBase, IMiddlewareExtension, IPermissionContributor
{
    public const string ExtensionId = "io.github.jiwenjimiran.nudity-level";
    public const string WritePermission = ExtensionId + ".settings.write";
    public const string FilterKey = "nudityLevelCriterion";
    public override UIManifest GetUIManifest()
    {
        var manifest = ManifestBuilder().AddSettingsTab("extensions/nudity-level", "Nudity Level", icon: "tags",
            description: "Configure nudity buckets and compound rules.")
            .AddSettingsSection("extensions/nudity-level", "Nudity Level", "NuditySettingsPanel")
            .AddSettingsSection("extensions", "Nudity Level", "NuditySettingsPanel", id: ExtensionId + ":installed-settings")
            .AddSlot("app-floating-ui", "NudityFilters").Build();
        manifest.ListFilters = new[] { "videos", "images" }.Select(kind => new UIListFilterContribution(
            Id: $"{ExtensionId}:nudity:{kind}", EntityType: kind, Label: "Nudity level", CriterionType: "string",
            ExtensionId: ExtensionId, FilterKey: FilterKey, Modifiers: ["EQUALS"], Order: 65)).ToList();
        return manifest;
    }
    public IEnumerable<PermissionDefinition> ContributePermissions() => [new(WritePermission, "Nudity Level",
        "Change shared nudity buckets and compound rules.", Source: $"extension:{ExtensionId}", GrantToAdminsByDefault: true)];
    public Task InvokeAsync(HttpContext context, RequestDelegate next) => NudityFilterMiddleware.InvokeAsync(context, next);
    public override void MapEndpoints(IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/ext/nudity-level");
        group.MapGet("/settings", async (HttpContext http, CancellationToken ct) => {
            var settings = await SettingsStore.ResolveAsync(http.RequestServices.GetRequiredService<CoveContext>(), await SettingsStore.LoadAsync(Store, ct), ct);
            var principal = http.RequestServices.GetRequiredService<ICurrentPrincipalAccessor>().Current;
            return Results.Ok(new { settings, canWrite = principal?.Has(WritePermission) == true });
        }).RequireCovePermission(Permissions.TagsRead);
        group.MapGet("/defaults", () => Results.Ok(NuditySettings.Defaults())).RequireCovePermission(Permissions.TagsRead);
        group.MapPut("/settings", async (NuditySettings settings, HttpContext http, CancellationToken ct) => {
            try {
                settings = await SettingsStore.ResolveAsync(http.RequestServices.GetRequiredService<CoveContext>(), settings.Upgrade(), ct);
                await SettingsStore.SaveAsync(Store, settings, ct);
                return Results.Ok(settings);
            } catch (ArgumentException ex) { return Results.BadRequest(new { message = ex.Message }); }
        }).RequireCovePermission(WritePermission, Permissions.TagsRead);
        group.MapGet("/tags", async (string? q, int? page, HttpContext http, CancellationToken ct) => {
            var db = http.RequestServices.GetRequiredService<CoveContext>();
            var query = db.Tags.AsNoTracking();
            var search = (q ?? "").Trim().ToLowerInvariant();
            if (search.Length > 512) return Results.BadRequest(new { message = "Search is too long." });
            if (search.Length > 0) query = query.Where(t => t.Name.ToLower().Contains(search) || t.Aliases.Any(a => a.Alias.ToLower().Contains(search)));
            var current = Math.Clamp(page ?? 1, 1, 1000000);
            var results = await query.OrderBy(t => t.Name).ThenBy(t => t.Id).Skip((current - 1) * 30).Take(31)
                .Select(t => new { t.Id, t.Name }).ToListAsync(ct);
            return Results.Ok(new { items = results.Take(30), page = current, hasMore = results.Count > 30 });
        }).RequireCovePermission(Permissions.TagsRead);
    }
}

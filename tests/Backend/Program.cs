using System.Text.Json;
using Cove.Core.Auth;
using Cove.Core.Entities;
using Cove.Data;
using Cove.NudityLevel;
using Cove.Plugins;
using Microsoft.AspNetCore.Http;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Pgvector.EntityFrameworkCore;
using System.IO.Compression;
using System.Runtime.Loader;

if (args.Length == 2 && args[0] == "--fixtures") {
    var folder = Path.GetFullPath(args[1]); Directory.CreateDirectory(folder);
    var json = new JsonSerializerOptions(JsonSerializerDefaults.Web) { WriteIndented = true };
    var defaults = NuditySettings.Defaults();
    defaults = defaults with { Tags = defaults.Tags.Select((t, i) => t with { TagId = i + 1 }).ToList() };
    File.WriteAllText(Path.Combine(folder, "defaults.json"), JsonSerializer.Serialize(defaults, json));
    var extension = new NudityLevelExtension();
    ((IManifestAware)extension).ApplyManifest(JsonSerializer.Deserialize<ExtensionManifestFile>(File.ReadAllText("src/NudityLevel/extension.json"), json)!);
    File.WriteAllText(Path.Combine(folder, "ui-manifest.json"), JsonSerializer.Serialize(extension.GetUIManifest(), json));
    Console.WriteLine("Generated actual backend defaults and UI manifest for host rendering checks."); return;
}

if (args.Length == 2 && args[0] == "--package") {
    var zip = Path.GetFullPath(args[1]);
    var destination = Path.Combine(Path.GetDirectoryName(zip)!, "host-install-" + Guid.NewGuid().ToString("N"));
    ZipFile.ExtractToDirectory(zip, destination);
    var manifest = JsonSerializer.Deserialize<ExtensionManifestFile>(File.ReadAllText(Path.Combine(destination, "extension.json")), new JsonSerializerOptions(JsonSerializerDefaults.Web))!;
    var loaderType = typeof(IExtension).Assembly.GetType("Cove.Plugins.ExtensionLoadContext", true)!;
    var loader = (AssemblyLoadContext)Activator.CreateInstance(loaderType, Path.Combine(destination, manifest.EntryDll!), destination, destination)!;
    try {
        var assembly = loader.LoadFromAssemblyPath(Path.Combine(destination, manifest.EntryDll!));
        var extension = (IExtension)Activator.CreateInstance(assembly.GetTypes().Single(t => !t.IsAbstract && typeof(IExtension).IsAssignableFrom(t)))!;
        ((IManifestAware)extension).ApplyManifest(manifest);
        ((IStatefulExtension)extension).SetStore(new MemoryStore());
        var ui = ((IUIExtension)extension).GetUIManifest();
        if (extension.Id != NudityLevelExtension.ExtensionId || ui.ListFilters.Count != 2 || ui.SettingsTabs.Count != 1 || ui.SettingsPanels.Count != 2 || ui.Slots.Count != 1
            || !ui.SettingsPanels.Any(p => p.TargetTab == "extensions")) throw new Exception("Package manifest/UI contract mismatch.");
        foreach (var asset in new[] { manifest.JsBundle, manifest.CssBundle, "assets/settings.mjs", "assets/model.mjs", "assets/filters.mjs", "assets/drag.mjs" }) if (!File.Exists(Path.Combine(destination, asset!))) throw new Exception("Missing asset " + asset);
        var app = Microsoft.AspNetCore.Builder.WebApplication.CreateBuilder().Build();
        ((IApiExtension)extension).MapEndpoints(app);
        if (((Microsoft.AspNetCore.Routing.IEndpointRouteBuilder)app).DataSources.SelectMany(s => s.Endpoints).Count() != 4) throw new Exception("Package settings/search endpoints did not map.");
        await app.DisposeAsync();
        Console.WriteLine("PASS extracted ZIP loads through Cove's isolated extension loader; identity, settings, filters, assets and all four API endpoints verified.");
    } finally { loader.Unload(); }
    return;
}

var passed = 0;
void Check(bool condition, string message) { if (!condition) throw new Exception(message); passed++; Console.WriteLine("PASS " + message); }
var settings = NuditySettings.BodyDefaults();
settings = settings with { Tags = settings.Tags.Select((t, i) => t with { TagId = i + 1 }).ToList() };
int Id(string name) => settings.Tags.Single(t => t.Name == name).TagId!.Value;
string Level(params string[] names) => Classification.Level(settings, names.Select(Id), false);
Check(settings.Tags.Count == 37 && settings.Tags.Select(t => t.Name).Distinct().Count() == 37, "all 37 model tags assigned exactly once");
foreach (var tag in settings.Tags) Check(Level(tag.Name) == (tag.Bucket == "neutral" ? "none" : tag.Bucket), "individual bucket: " + tag.Name);
Check(Level("Pussy", "Nipples") == "full", "Pussy + Nipples = Full");
Check(Level("Asshole", "Nipples") == "full", "Asshole + Nipples = Full");
Check(Level("Anal Gape", "Nipples") == "full", "Anal Gape + Nipples = Full");
foreach (var tag in settings.Tags.Where(t => t.Genital)) Check(Level(tag.Name, "Nipples") == "full", "equivalent genital combination: " + tag.Name);
Check(Level("Pussy Hair", "Nipples") == "high", "Pussy Hair + Nipples = High");
Check(Level("Ass", "Thighs") == "medium", "highest individual bucket");
Check(Level() == "unknown" && Classification.Level(settings, [], true) == "none", "Unknown versus analyzed None");
Check(Classification.Level(settings with { CombinationEnabled = false }, [Id("Pussy"), Id("Nipples")], true) == "high", "disabled combination");
Check(Classification.Level(settings with { Tags = settings.Tags.Select(t => t with { Genital = false }).ToList() }, [Id("Pussy"), Id("Nipples")], true) == "high", "empty genital set disables combination");
var moved = settings with { Tags = settings.Tags.Select(t => t.Name == "Pussy" ? t with { Bucket = "low" } : t).ToList() };
Check(Classification.Level(moved, [Id("Pussy"), Id("Nipples")], true) == "full", "bucket moves preserve independent combination membership");
Evidence E(string tag, string source = "ext:ai.tagging", string model = "bodyparts", string run = "") => new(1, Id(tag), source, model, run);
Check(Classification.FromEvidence(settings, [E("Face"), E("Dick", "user")], false, new HashSet<string>()) == "none", "AI neutral evidence overrides manual Full");
Check(Classification.FromEvidence(settings, [E("Dick", "user")], true, new HashSet<string>()) == "none", "completed zero-tag body run overrides manual evidence");
Check(Classification.FromEvidence(settings, [E("Dick", "user")], false, new HashSet<string>()) == "full", "manual fallback");
Check(Classification.FromEvidence(settings, [E("Dick", "scraper:test")], false, new HashSet<string>()) == "unknown", "scrapers excluded");
Check(Classification.FromEvidence(settings, [E("Dick", run: "failed"), E("Thighs", "user")], false, new HashSet<string> { "failed" }) == "low", "failed AI evidence excluded");
Check(Classification.FromEvidence(settings, [E("Pussy", model: "custom"), E("Nipples", model: "custom")], false, new HashSet<string>()) == "full", "configured evidence from another AI model");
using (var criterion = JsonDocument.Parse("{\"value\":\"full,high,full\",\"modifier\":\"EQUALS\"}")) Check(NudityFilterMiddleware.Parse(criterion.RootElement).SequenceEqual(new[] { "full", "high" }), "criterion parsing");
try { using var invalid = JsonDocument.Parse("{\"value\":\"bad\"}"); NudityFilterMiddleware.Parse(invalid.RootElement); throw new Exception("accepted invalid level"); } catch (ArgumentException) { passed++; }
try { (settings with { Tags = [settings.Tags[0], settings.Tags[0]] }).Validate(); throw new Exception("accepted duplicates"); } catch (ArgumentException) { passed++; }

var v2 = NuditySettings.Defaults();
v2 = v2 with { Tags = v2.Tags.Select((t, i) => t with { TagId = i + 1 }).ToList() };
int V2Id(string name) => v2.Tags.Single(t => t.Name == name).TagId!.Value;
string V2Key(string name) => v2.Tags.Single(t => t.Name == name).Key;
string V2Level(params string[] names) => Classification.Level(v2, names.Select(V2Id), false);
Check(v2.Tags.Count == 155 && v2.Tags.Select(t => t.Name).Distinct().Count() == 155, "155 unique model defaults");
var modelLists = JsonSerializer.Deserialize<Dictionary<string, string[]>>(File.ReadAllText("tests/fixtures/model-tags.json"))!;
Check(modelLists.Values.SelectMany(names => names).Distinct().Order().SequenceEqual(v2.Tags.Select(t => t.Name).Order()), "all four supplied model lists covered exactly, with 69 deduplicated");
foreach (var tag in v2.Tags) Check(V2Level(tag.Name) == (tag.Bucket == "neutral" ? tag.EstablishesCoverage ? "none" : "unknown" : tag.Bucket), "v2 individual classification: " + tag.Name);
Check(V2Level("Pussy", "Nipples") == "full" && V2Level("Asshole", "Nipples") == "full" && V2Level("Pussy Hair", "Nipples") == "high", "v2 preserves body Full combinations and Pussy Hair exception");
foreach (var name in new[] { "Upskirt", "Undressing", "Sucking Toy/Dildo" }) Check(V2Level(name) == "medium", "requested Medium override: " + name);
Check(V2Level("Cum on Person") == "high" && V2Level("Cum Swapping") == "high" && V2Level("Catheter") == "full", "requested fluid and catheter overrides");
Evidence Proxy(string tag, string model, string source = "ext:ai.tagging") => new(1, V2Id(tag), source, model, "");
Check(Classification.FromEvidence(v2, [Proxy("Vaginal Fucking", "actions")], false, new HashSet<string>()) == "full", "action-only AI sex establishes Full without body analysis");
Check(Classification.FromEvidence(v2, [Proxy("Missionary", "positions")], false, new HashSet<string>()) == "full", "position-only AI sex establishes Full without body analysis");
Check(Classification.FromEvidence(v2, [Proxy("Sitting", "positions"), Proxy("Kissing", "actions")], false, new HashSet<string>()) == "unknown", "generic-only nonbody AI stays Unknown");
Check(Classification.FromEvidence(v2, [Proxy("Sitting", "positions"), Proxy("Boobs", "", "user")], false, new HashSet<string>()) == "medium", "generic AI does not suppress relevant manual fallback");
Check(Classification.FromEvidence(v2, [Proxy("Doggystyle", "positions")], true, new HashSet<string>()) == "full", "sex proxy overrides completed zero-detection body analysis");
Check(V2Level("Cum on Person", "Nipples") == "high", "proxy High tags do not automatically join the body Full rule");
var compound = new CompoundRule("test", "Generic combination", "high", true, [[V2Key("Kissing"), V2Key("Sitting")], [V2Key("Handcuffed")]]);
var customRules = v2 with { Rules = [compound] };
Check(Classification.Level(customRules, [V2Id("Sitting"), V2Id("Handcuffed")], false) == "high", "ANY within group and ALL groups produce custom High");
Check(Classification.Level(customRules, [V2Id("Sitting")], false) == "unknown", "incomplete compound does not establish coverage");
Check(Classification.Level(customRules with { Rules = [compound with { Level = "none" }] }, [V2Id("Kissing"), V2Id("Handcuffed")], false) == "none", "explicit rule can establish None from generic signals");
Check(Classification.Level(customRules with { Rules = [compound with { Enabled = false }] }, [V2Id("Kissing"), V2Id("Handcuffed")], false) == "unknown", "disabled compound ignored");
Check(Classification.Level(customRules, [V2Id("Kissing"), V2Id("Handcuffed"), V2Id("Blowjob")], false) == "full", "compound result cannot lower stronger individual evidence");
try { (v2 with { Rules = [compound with { Groups = [[]] }] }).Validate(); throw new Exception("accepted enabled empty group"); } catch (ArgumentException) { passed++; }
try { (v2 with { Rules = [compound with { Groups = [["missing"]] }] }).Validate(); throw new Exception("accepted missing rule tag"); } catch (ArgumentException) { passed++; }
var legacy = settings with { CombinationEnabled = false, Tags = [..settings.Tags.Where(t => t.Name != "Belly Button"), new("custom:handjob", "Handjob", "low", 999)] };
var migrated = legacy.Upgrade();
Check(migrated.SchemaVersion == 2 && migrated.DefaultsRevision == 2 && !migrated.Rules!.Single().Enabled, "v1 settings and disabled combination migrate to v2");
Check(!migrated.Tags.Any(t => t.Name == "Belly Button") && migrated.Tags.Single(t => t.Name == "Handjob").Bucket == "low", "migration preserves removals and custom proxy assignments");
var editedLegacy = settings with { Tags = settings.Tags.Select(t => t.Name == "Pussy Hair" ? t with { Genital = true } : t).ToList() };
Check(editedLegacy.Upgrade().Rules!.Single().Groups[0].Contains("default:pussy hair"), "migration preserves edited legacy combination memberships");
var emptyLegacy = (settings with { Tags = [] }).Upgrade();
Check(!emptyLegacy.Rules!.Single().Enabled && emptyLegacy.Tags.Count == 118, "empty legacy combination migrates inactive without resurrecting removed body tags");
var migrationStore = new MemoryStore();
await migrationStore.SetAsync("settings", JsonSerializer.Serialize(legacy, new JsonSerializerOptions(JsonSerializerDefaults.Web)));
var loadedMigration = await SettingsStore.LoadAsync(migrationStore);
await SettingsStore.SaveAsync(migrationStore, loadedMigration with { Tags = loadedMigration.Tags.Where(t => t.Name != "Doggystyle").ToList() }, default);
Check(!(await SettingsStore.LoadAsync(migrationStore)).Tags.Any(t => t.Name == "Doggystyle"), "new defaults append once; later removals survive reload");

using var connection = new SqliteConnection("Data Source=:memory:"); connection.Open();
var options = new DbContextOptionsBuilder<CoveContext>().UseSqlite(connection).Options;
using var db = new QueryContext(options); db.Database.EnsureCreated();
using (var seed = new DbContext(new DbContextOptionsBuilder().UseSqlite(connection).UseModel(db.Model).Options)) {
    seed.AddRange(settings.Tags.Select(t => new Tag { Id = t.TagId!.Value, Name = t.Name }));
    seed.Add(new TagAlias { TagId = Id("Pussy"), Alias = "alias-pussy" });
    seed.AddRange(Enumerable.Range(1, 6).Select(id => new Video { Id = id }));
    seed.AddRange(Enumerable.Range(1, 6).Select(id => new Image { Id = id }));
    seed.AddRange(Enumerable.Range(1, 6).Select(id => new VideoFile { Id = id, VideoId = id, Size = id * 100 }));
    var next = 1;
    foreach (var host in new[] { AffinityHostType.Video, AffinityHostType.Image }) {
        foreach (var tag in new[] { "Pussy", "Nipples" }) seed.Add(new TagApplication { Id = next++, HostType = host, HostId = 1, TagId = Id(tag), SourceKey = "ext:ai.tagging", ModelKey = "bodyparts" });
        seed.Add(new TagApplication { Id = next++, HostType = host, HostId = 2, TagId = Id("Pussy Hair"), SourceKey = "user" });
        seed.Add(new TagApplication { Id = next++, HostType = host, HostId = 3, TagId = Id("Dick"), SourceKey = "scraper:test" });
        seed.Add(new TagApplication { Id = next++, HostType = host, HostId = 4, TagId = Id("Dick"), SourceKey = "user" });
        seed.Add(new TagApplication { Id = next++, HostType = host, HostId = 5, TagId = Id("Feet"), SourceKey = "user" });
    }
    seed.AddRange(new AiRun { Id = 1, TargetType = AiRunTargetType.Video, TargetId = 4, Status = AiRunStatus.Completed, Models = JsonDocument.Parse("[{\"config_name\":\"body_20\"}]") },
        new AiRun { Id = 2, TargetType = AiRunTargetType.Image, TargetId = 4, Status = AiRunStatus.Completed, Models = JsonDocument.Parse("[{\"config_name\":\"body_20\"}]") });
    seed.SaveChanges();
}
foreach (var kind in new[] { "video", "image" }) {
    var values = await Classification.LoadAsync(db, kind, [1, 2, 3, 4, 5, 6], settings);
    Check(values.Values.SequenceEqual(new[] { "full", "medium", "unknown", "none", "low", "unknown" }), kind + " persisted evidence, runs and fallback");
    var matches = await NudityFilterMiddleware.MatchingIdsAsync(db, kind, ["full", "medium"], settings);
    Check(matches.SequenceEqual(new[] { 1, 2 }), kind + " multi-level membership");
    using var narrow = new NudityReadContext(new DbContextOptionsBuilder<CoveContext>(options).UseModel(db.Model).Options, new CurrentPrincipalAccessor(), db, kind, matches);
    var query = kind == "video" ? narrow.Videos.Select(v => v.Id) : narrow.Images.Select(i => i.Id);
    Check(await query.CountAsync() == 2 && await query.Order().Skip(1).Take(1).SingleAsync() == 2, kind + " counts and pagination after filtering");
    using var composed = new NudityReadContext(new DbContextOptionsBuilder<CoveContext>(options).UseModel(db.Model).Options, new CurrentPrincipalAccessor(), narrow, kind, [2, 3]);
    Check(await (kind == "video" ? composed.Videos.Select(v => v.Id) : composed.Images.Select(i => i.Id)).SingleAsync() == 2, kind + " preserves earlier query restrictions");
}
var bound = await SettingsStore.ResolveAsync(db, NuditySettings.BodyDefaults());
Check(bound.Tags.All(t => t.TagId.HasValue && !t.Missing), "default tags bind to database IDs");
var alias = await SettingsStore.ResolveAsync(db, new(1, true, [new("test", "alias-pussy", "high")]));
Check(alias.Tags.Single().TagId == Id("Pussy"), "alias resolution");
var collision = await SettingsStore.ResolveAsync(db, new(2, false,
    [new("custom:p", "Custom name", "low", Id("Pussy")), new("new:alias", "alias-pussy", "high")],
    [new("alias-rule", "Alias rule", "high", true, [["new:alias"]])], 2));
Check(collision.Tags.Count == 1 && collision.Tags.Single().Bucket == "low" && collision.Rules!.Single().Groups[0].Single() == "custom:p",
    "alias collisions retain existing custom bucket and remap rule references without duplicate assignments");
// Exercise persisted action-only/generic-only evidence through the same list adapter used in production.
using (var seed = new DbContext(new DbContextOptionsBuilder().UseSqlite(connection).UseModel(db.Model).Options)) {
    seed.AddRange(new Tag { Id = 501, Name = "Vaginal Fucking" }, new Tag { Id = 502, Name = "Sitting" });
    seed.AddRange(new Video { Id = 7 }, new Video { Id = 8 }, new Image { Id = 7 }, new Image { Id = 8 });
    foreach (var host in new[] { AffinityHostType.Video, AffinityHostType.Image }) {
        seed.Add(new TagApplication { HostType = host, HostId = 7, TagId = 501, SourceKey = "ext:ai.tagging", ModelKey = "actions" });
        seed.Add(new TagApplication { HostType = host, HostId = 8, TagId = 502, SourceKey = "ext:ai.tagging", ModelKey = "positions" });
    }
    seed.SaveChanges();
}
var databaseV2 = await SettingsStore.ResolveAsync(db, NuditySettings.Defaults());
foreach (var kind in new[] { "video", "image" }) {
    var levels = await Classification.LoadAsync(db, kind, [7, 8], databaseV2);
    Check(levels[7] == "full" && levels[8] == "unknown", kind + " persisted action-only Full and generic-only Unknown");
    Check((await NudityFilterMiddleware.MatchingIdsAsync(db, kind, ["full"], databaseV2)).Contains(7), kind + " proxy evidence enters matching IDs before pagination");
}
using (var seed = new DbContext(new DbContextOptionsBuilder().UseSqlite(connection).UseModel(db.Model).Options)) {
    var pussyId = Id("Pussy");
    await seed.Set<Tag>().Where(t => t.Id == pussyId).ExecuteUpdateAsync(update => update.SetProperty(t => t.Name, "Renamed"));
}
var renamed = await SettingsStore.ResolveAsync(db, bound);
Check(renamed.Tags.Single(t => t.TagId == Id("Pussy")).Name == "Renamed", "bound tag survives rename");
var missing = await SettingsStore.ResolveAsync(db, new(1, true, [new("missing", "Dick", "full", 999)]));
Check(missing.Tags.Single().Missing && Classification.Level(missing, [999], false) == "unknown", "deleted custom tags stay missing and do not classify");
var store = new MemoryStore(); await SettingsStore.SaveAsync(store, settings, default);
Check((await SettingsStore.LoadAsync(store)).Tags.Count == 155, "versioned settings round trip and default upgrade");

// Optional integration against the actual sibling Filesizes build, with no public build dependency.
var filesizesPath = Path.GetFullPath("../cove_filesizes/src/Filesizes/bin/Release/net10.0/Cove.Filesizes.dll");
if (File.Exists(filesizesPath)) {
    var assembly = AssemblyLoadContext.Default.LoadFromAssemblyPath(filesizesPath);
    var contextType = assembly.GetType("Cove.Filesizes.FilesizeReadContext", true)!;
    var totalsMethod = assembly.GetType("Cove.Filesizes.SizeQueries", true)!.GetMethod("AllTotals")!;
    var contextOptions = new DbContextOptionsBuilder<CoveContext>(options).UseModel(db.Model).Options;
    int[] SizeIds(CoveContext source) => ((System.Collections.IEnumerable)totalsMethod.Invoke(null, [source, "video"])!).Cast<object>()
        .Where(row => (long)row.GetType().GetProperty("Bytes")!.GetValue(row)! >= 150)
        .Select(row => (int)row.GetType().GetProperty("Id")!.GetValue(row)!).ToArray();
    using var sizeFirst = (CoveContext)Activator.CreateInstance(contextType, contextOptions, new CurrentPrincipalAccessor(), "video", SizeIds(db))!;
    var nudeIds = await NudityFilterMiddleware.MatchingIdsAsync(sizeFirst, "video", ["full", "medium"], settings);
    Check(nudeIds.SequenceEqual(new[] { 2 }), "actual Filesizes then Nudity Level composition");
    using var nudeFirst = new NudityReadContext(contextOptions, new CurrentPrincipalAccessor(), db, "video", [1, 2]);
    using var sizeLast = (CoveContext)Activator.CreateInstance(contextType, contextOptions, new CurrentPrincipalAccessor(), "video", SizeIds(nudeFirst))!;
    Check(await sizeLast.Videos.Select(v => v.Id).SingleAsync() == 2, "actual Nudity Level then Filesizes composition");
}

// Exercise the request adapter with authenticated endpoint execution and retained metadata.
var accessor = new CurrentPrincipalAccessor();
accessor.Set(new CovePrincipal { UserId = 1, Username = "test", Kind = PrincipalKind.User, Roles = new HashSet<string>(), Permissions = new HashSet<string> { "videos.read", "images.read", "tags.read", "airuns.read" } });
var services = new ServiceCollection().AddSingleton<CoveContext>(db).AddSingleton<ICurrentPrincipalAccessor>(accessor).AddSingleton<IExtensionStoreFactory>(new StoreFactory(store)).BuildServiceProvider();
async Task<DefaultHttpContext> Request(string body, string kind = "videos") {
    var http = new DefaultHttpContext { RequestServices = services }; http.Request.Method = "POST"; http.Request.Path = $"/api/{kind}/find";
    http.Request.Body = new MemoryStream(System.Text.Encoding.UTF8.GetBytes(body)); http.Response.Body = new MemoryStream();
    http.SetEndpoint(new Endpoint(async ctx => { var filtered = ctx.RequestServices.GetRequiredService<CoveContext>();
        var count = kind == "videos" ? await filtered.Videos.CountAsync() : await filtered.Images.CountAsync();
        await ctx.Response.WriteAsJsonAsync(new { count }); }, new EndpointMetadataCollection("retained"), "fixture"));
    await NudityFilterMiddleware.InvokeAsync(http, ctx => ctx.GetEndpoint()!.RequestDelegate!(ctx));
    http.Response.Body.Position = 0; return http;
}
var response = await Request("{\"objectFilter\":{\"nudityLevelCriterion\":{\"value\":\"full\",\"modifier\":\"EQUALS\"}}}");
using (var json = await JsonDocument.ParseAsync(response.Response.Body)) Check(json.RootElement.GetProperty("count").GetInt32() == 2, "request adapter applies body and proxy classification before endpoint");
Check(response.RequestServices == services && response.GetEndpoint()!.Metadata.GetMetadata<string>() == "retained", "request services restored and metadata retained");
Check((await Request("{\"filterExpression\":{\"nudityLevelCriterion\":{\"value\":\"full\"}}}")).Response.StatusCode == 400, "grouped filter rejected");
Check((await Request("{\"objectFilter\":{\"nudityLevelCriterion\":{\"value\":\"bad\"}}}")).Response.StatusCode == 400, "invalid criterion rejected");
accessor.Set(CovePrincipal.Anonymous());
Check((await Request("{\"objectFilter\":{\"nudityLevelCriterion\":{\"value\":\"full\"}}}")).Response.StatusCode == 403, "missing permissions rejected");
accessor.Set(null);

using var pg = new CoveContext(new DbContextOptionsBuilder<CoveContext>().UseNpgsql("Host=localhost;Database=translation;Username=test", provider => provider.UseVector()).Options);
var sql = pg.TagApplications.Where(t => t.HostType == AffinityHostType.Video && new[] { 1, 2 }.Contains(t.HostId) && t.ContextType == null)
    .Select(t => new Evidence(t.HostId, t.TagId, t.SourceKey, t.ModelKey, t.SourceRunId)).ToQueryString();
Check(sql.Contains("SELECT") && sql.Contains("FROM"), "PostgreSQL evidence query translates against full host model");
Check(pg.Tags.Where(t => new[] { "pussy" }.Contains(t.Name.ToLower()) || t.Aliases.Any(a => new[] { "pussy" }.Contains(a.Alias.ToLower())))
    .Select(t => new { t.Id, t.Name, Aliases = t.Aliases.Select(a => a.Alias).ToArray() }).ToQueryString().Contains("SELECT"), "PostgreSQL alias resolution translates");
Console.WriteLine($"Completed {passed} backend checks.");

sealed class QueryContext(DbContextOptions<CoveContext> options) : CoveContext(options)
{
    protected override void OnModelCreating(ModelBuilder model) {
        var entities = new (Type Type, string[] Keep)[] {
            (typeof(Video), ["Id", "ParentVideoId"]), (typeof(Image), ["Id"]),
            (typeof(VideoFile), ["Id", "VideoId", "Size"]),
            (typeof(Tag), ["Id", "Name", "Aliases"]), (typeof(TagAlias), ["Id", "TagId", "Alias", "Tag"]),
            (typeof(TagApplication), ["Id", "HostType", "HostId", "ContextType", "TagId", "SourceKey", "ModelKey", "SourceRunId"]),
            (typeof(AiRun), ["Id", "TargetType", "TargetId", "RunKey", "Status", "Models"])
        };
        foreach (var (type, keep) in entities) {
            var entity = model.Entity(type).HasBaseType((Type?)null);
            foreach (var property in type.GetProperties()) if (!keep.Contains(property.Name)) entity.Ignore(property.Name);
            entity.HasKey("Id"); entity.ToTable(type.Name);
        }
        model.Entity<TagAlias>().HasOne(t => t.Tag).WithMany(t => t.Aliases).HasForeignKey(t => t.TagId);
        model.Entity<AiRun>().Property(r => r.Models).HasConversion(v => v == null ? null : v.RootElement.GetRawText(), v => v == null ? null : JsonDocument.Parse(v, default(JsonDocumentOptions)));
        foreach (var other in model.Model.GetEntityTypes().Select(e => e.ClrType).ToArray()) if (!entities.Any(e => e.Type == other)) model.Ignore(other);
    }
}
sealed class MemoryStore : IExtensionStore {
    private readonly Dictionary<string, string> data = [];
    public Task<string?> GetAsync(string key, CancellationToken ct = default) => Task.FromResult(data.GetValueOrDefault(key));
    public Task SetAsync(string key, string value, CancellationToken ct = default) { data[key] = value; return Task.CompletedTask; }
    public Task DeleteAsync(string key, CancellationToken ct = default) { data.Remove(key); return Task.CompletedTask; }
    public Task<Dictionary<string, string>> GetAllAsync(CancellationToken ct = default) => Task.FromResult(data);
}
sealed class StoreFactory(IExtensionStore store) : IExtensionStoreFactory { public IExtensionStore CreateStore(string extensionId) => store; }

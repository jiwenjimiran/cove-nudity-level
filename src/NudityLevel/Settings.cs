using System.Text.Json;
using Cove.Data;
using Cove.Plugins;
using Microsoft.EntityFrameworkCore;

namespace Cove.NudityLevel;

public sealed record TagRule(string Key, string Name, string Bucket, int? TagId = null, bool Genital = false, bool Nipple = false, bool Missing = false, bool EstablishesCoverage = true);
public sealed record CompoundRule(string Key, string Name, string Level, bool Enabled, List<List<string>> Groups);
// Legacy fields are retained for reading v1 settings. V2 classification uses Rules exclusively.
public sealed record NuditySettings(int SchemaVersion, bool CombinationEnabled, List<TagRule> Tags, List<CompoundRule>? Rules = null, int DefaultsRevision = 0)
{
    public static readonly string[] Buckets = ["neutral", "low", "medium", "high", "full"];
    public static readonly string[] Levels = ["unknown", "none", "low", "medium", "high", "full"];
    public static NuditySettings BodyDefaults()
    {
        var tags = new List<TagRule>();
        void Add(string bucket, string names) {
            foreach (var name in names.Split('|')) tags.Add(new TagRule("default:" + name.ToLowerInvariant(), name, bucket,
                Genital: bucket == "high" && name != "Nipples", Nipple: name == "Nipples"));
        }
        Add("neutral", "Face|Fingers|Oiled|Wet (Water)");
        Add("low", "Belly Button|Thighs|Feet|Lower Legs|Cum|Tongue|Spit");
        Add("medium", "Ass|Boobs|Pussy Hair");
        Add("high", "Asshole|Anal Gape|Nipples|Pussy|Pussy Gape|Pussy Fully Visible|Pussy Closeup|Pussy Very Closeup|Wet Pussy|Very Wet Pussy|Cum on Pussy|Small Labia|Big Labia|Pierced Pussy|Very Hairy Pussy|Innie|Medium Labia|Spread Labia|Pink Pussy|Brown Pussy|Shaved Pussy");
        Add("full", "Balls|Dick");
        return new(1, true, tags);
    }
    public static List<TagRule> ProxyDefaults()
    {
        var tags = new List<TagRule>();
        void Add(string bucket, string names) {
            foreach (var name in names.Split('|')) tags.Add(new("default:" + name.ToLowerInvariant(), name, bucket, EstablishesCoverage: bucket != "neutral"));
        }
        Add("full", "69|Doggystyle|Facesitting|Cowgirl|Rev Cowgirl|Missionary|G Missionary|Orgy|Anal Fucking|Ass Licking|Ass Penetration|Ball Licking/Sucking|Blowjob|Cumshot|Deepthroat|Double Penetration|Fingering|Fisting|Gangbang|Handjob|Licking Penis|Masturbation|Pussy Licking (Clearly Visible)|Pussy Licking|Titjob|Tribbing/Scissoring|Vaginal Penetration|Vaginal Fucking|Pegging|Anal Hook|Tied Penis|Tied Balls");
        Add("high", "Cum on Person|Cum Swapping|Pissing|Wet (Genitals)|Crotch Roped");
        Add("medium", "Upskirt|Grabbing Ass|Grabbing Boobs|Undressing|Bondaged Boobs");
        Add("low", "Sucking Fingers");
        Add("neutral", "Kneeling|Laying Down|Bent Over|Sitting|Squatting|Flexible|FPOV|MPOV|BTS|CloseUp|1F|1F1M|2F|2F1M|3F|1F2M|1M|2M|3M|Grabbing Hair/Head|Kissing|Female Bondage|Male Bondage|Bondage|Choking|Gag|Pain|Unused1|Ball Gag|Ring Gag|Harness Gag|Bit Gag|Unused2|Muzzle Gag|Dildo Gag|Inflatable Gag|Tape Gag|Rope Bondage|Metal Bondage|Leather Bondage|Collared|Unused3|Blindfolded|Chair Tied|Straight Jacket|Yoke|Whip|Flogger|Electric Torture|Crush Torture|Arm Binder|Rope Collar|Leather Collar|Metal Collar|Unused4|Leash|Handcuffed|Stand Cradle|Footjob|Gloryhole|Pussy Rubbing|Catheter|Chastity|Chastity (Male)|Chastity (Female)|Metal Chastity|Plastic Chastity|Cum in Chastity|Vibrating|Nipple Clamps|Clover Clamps|Clothes Pin|Weights|Alligator Clamp|Sucking Toy/Dildo");
        return tags;
    }
    private static CompoundRule LegacyRule(NuditySettings settings) => new("default:full-combination", "Genital + nipples", "full", settings.CombinationEnabled && settings.Tags.Any(t => t.Genital) && settings.Tags.Any(t => t.Nipple),
        [settings.Tags.Where(t => t.Genital).Select(t => t.Key).ToList(), settings.Tags.Where(t => t.Nipple).Select(t => t.Key).ToList()]);
    public static NuditySettings Defaults() => BodyDefaults().Upgrade();
    public NuditySettings Upgrade()
    {
        var validated = Validate();
        var upgraded = SchemaVersion == 1 ? validated with { SchemaVersion = 2, CombinationEnabled = false,
            Rules = [LegacyRule(validated)], Tags = validated.Tags.Select(t => t with { Genital = false, Nipple = false }).ToList() } : validated;
        if (upgraded.DefaultsRevision < 2) {
            var keys = upgraded.Tags.Select(t => t.Key).ToHashSet(StringComparer.OrdinalIgnoreCase);
            var names = upgraded.Tags.Select(t => t.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
            upgraded = upgraded with { DefaultsRevision = 2, Tags = [..upgraded.Tags, ..ProxyDefaults().Where(t => !keys.Contains(t.Key) && !names.Contains(t.Name))] };
        }
        if (upgraded.DefaultsRevision < 3) {
            // Update factory assignments only; preserve moved/custom tags, IDs, removals and rules.
            var previous = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase) {
                ["default:stand cradle"] = "full",
                ["default:footjob"] = "full",
                ["default:gloryhole"] = "full",
                ["default:pussy rubbing"] = "full",
                ["default:catheter"] = "full",
                ["default:chastity"] = "high",
                ["default:chastity (male)"] = "high",
                ["default:chastity (female)"] = "high",
                ["default:metal chastity"] = "high",
                ["default:plastic chastity"] = "high",
                ["default:cum in chastity"] = "high",
                ["default:vibrating"] = "high",
                ["default:nipple clamps"] = "high",
                ["default:clover clamps"] = "high",
                ["default:clothes pin"] = "high",
                ["default:weights"] = "high",
                ["default:alligator clamp"] = "high",
                ["default:sucking toy/dildo"] = "medium",
            };
            upgraded = upgraded with { DefaultsRevision = 3, Tags = upgraded.Tags.Select(tag =>
                previous.TryGetValue(tag.Key, out var bucket) && tag.Bucket == bucket && tag.EstablishesCoverage
                    ? tag with { Bucket = "neutral", EstablishesCoverage = false } : tag).ToList() };
        }
        return upgraded.Validate();
    }
    public NuditySettings Validate()
    {
        if (SchemaVersion is not (1 or 2) || DefaultsRevision is < 0 or > 3 || Tags is null || Tags.Count > 2000) throw new ArgumentException("Unsupported settings version or too many tags (maximum 2000).");
        if (Tags.Any(t => t is null || string.IsNullOrWhiteSpace(t.Key) || t.Key.Length > 256 || string.IsNullOrWhiteSpace(t.Name) || t.Name.Length > 512
            || !Buckets.Contains(t.Bucket) || t.TagId is <= 0)) throw new ArgumentException("Each tag needs a unique key, name, valid bucket, and positive database ID when supplied.");
        if (Tags.Select(t => t.Key.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).Count() != Tags.Count
            || Tags.Where(t => t.TagId.HasValue).Select(t => t.TagId).Distinct().Count() != Tags.Count(t => t.TagId.HasValue)) throw new ArgumentException("A tag can belong to only one bucket.");
        var normalized = Tags.Select(t => t with { Key = t.Key.Trim(), Name = t.Name.Trim(), Missing = false }).ToList();
        if (SchemaVersion == 2) {
            if (Rules is null || Rules.Count > 100 || Rules.Any(r => r is null || string.IsNullOrWhiteSpace(r.Key) || r.Key.Length > 256
                || string.IsNullOrWhiteSpace(r.Name) || r.Name.Length > 256 || !Levels.Skip(1).Contains(r.Level) || r.Groups is null || r.Groups.Count > 20))
                throw new ArgumentException("Provide at most 100 named rules with target None through Full and at most 20 groups.");
            var keys = normalized.Select(t => t.Key).ToHashSet();
            if (Rules.Select(r => r.Key).Distinct().Count() != Rules.Count || Rules.Any(r => r.Groups.Any(g => g is null || g.Count > 2000 || g.Any(key => !keys.Contains(key)))
                || r.Enabled && (r.Groups.Count == 0 || r.Groups.Any(g => g.Count == 0))))
                throw new ArgumentException("Enabled rules need at least one nonempty group; every selected tag must have a bucket assignment.");
        }
        return this with { Tags = normalized };
    }
}

public static class SettingsStore
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private static readonly SemaphoreSlim Gate = new(1, 1);
    public static async Task<NuditySettings> LoadAsync(IExtensionStore store, CancellationToken ct = default)
    {
        await Gate.WaitAsync(ct);
        try {
            var payload = await store.GetAsync("settings", ct);
            if (string.IsNullOrWhiteSpace(payload)) return NuditySettings.Defaults();
            var saved = JsonSerializer.Deserialize<NuditySettings>(payload, Json) ?? throw new InvalidOperationException("Nudity Level settings could not be read.");
            var upgraded = saved.Upgrade();
            if (saved.SchemaVersion != upgraded.SchemaVersion || saved.DefaultsRevision != upgraded.DefaultsRevision)
                await store.SetAsync("settings", JsonSerializer.Serialize(upgraded, Json), ct);
            return upgraded;
        } finally { Gate.Release(); }
    }
    public static async Task SaveAsync(IExtensionStore store, NuditySettings settings, CancellationToken ct) {
        await Gate.WaitAsync(ct);
        try { await store.SetAsync("settings", JsonSerializer.Serialize(settings.Upgrade(), Json), ct); }
        finally { Gate.Release(); }
    }

    // Bound IDs survive renames; deleted IDs never silently bind to another tag.
    public static async Task<NuditySettings> ResolveAsync(CoveContext db, NuditySettings settings, CancellationToken ct = default)
    {
        var ids = settings.Tags.Where(t => t.TagId.HasValue).Select(t => t.TagId!.Value).ToArray();
        var names = settings.Tags.Where(t => t.TagId == null).Select(t => t.Name.ToLowerInvariant()).ToArray();
        var candidates = await db.Tags.AsNoTracking().Where(t => ids.Contains(t.Id) || names.Contains(t.Name.ToLower())
            || t.Aliases.Any(a => names.Contains(a.Alias.ToLower())))
            .Select(t => new { t.Id, t.Name, Aliases = t.Aliases.Select(a => a.Alias).ToArray() }).ToListAsync(ct);
        var used = new Dictionary<int, string>();
        var remap = new Dictionary<string, string>();
        var resolved = new List<TagRule>();
        foreach (var rule in settings.Tags) {
            var matches = candidates.Where(t => rule.TagId.HasValue ? t.Id == rule.TagId
                : t.Name.Equals(rule.Name, StringComparison.OrdinalIgnoreCase) || t.Aliases.Contains(rule.Name, StringComparer.OrdinalIgnoreCase)).ToList();
            if (matches.Count != 1) { resolved.Add(rule with { Missing = true }); continue; }
            if (used.TryGetValue(matches[0].Id, out var existing)) { remap[rule.Key] = existing; continue; }
            used[matches[0].Id] = rule.Key;
            resolved.Add(rule with { TagId = matches[0].Id, Name = matches[0].Name, Missing = false });
        }
        return settings with { Tags = resolved, Rules = settings.Rules?.Select(r => r with { Groups = r.Groups.Select(g => g.Select(k => remap.GetValueOrDefault(k, k)).Distinct().ToList()).ToList() }).ToList() };
    }
}

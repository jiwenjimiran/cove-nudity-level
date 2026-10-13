using System.Text.Json;
using Cove.Data;
using Cove.Plugins;
using Microsoft.EntityFrameworkCore;

namespace Cove.NudityLevel;

public sealed record TagRule(string Key, string Name, string Bucket, int? TagId = null, bool Genital = false, bool Nipple = false, bool Missing = false);
public sealed record NuditySettings(int SchemaVersion, bool CombinationEnabled, List<TagRule> Tags)
{
    public static readonly string[] Buckets = ["neutral", "low", "medium", "high", "full"];
    public static readonly string[] Levels = ["unknown", "none", "low", "medium", "high", "full"];
    public static NuditySettings Defaults()
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
    public NuditySettings Validate()
    {
        if (SchemaVersion != 1 || Tags is null || Tags.Count > 2000) throw new ArgumentException("Unsupported settings version or too many tags (maximum 2000).");
        if (Tags.Any(t => t is null || string.IsNullOrWhiteSpace(t.Key) || t.Key.Length > 256 || string.IsNullOrWhiteSpace(t.Name) || t.Name.Length > 512
            || !Buckets.Contains(t.Bucket) || t.TagId is <= 0)) throw new ArgumentException("Each tag needs a unique key, name, valid bucket, and positive database ID when supplied.");
        if (Tags.Select(t => t.Key.Trim()).Distinct(StringComparer.OrdinalIgnoreCase).Count() != Tags.Count
            || Tags.Where(t => t.TagId.HasValue).Select(t => t.TagId).Distinct().Count() != Tags.Count(t => t.TagId.HasValue)) throw new ArgumentException("A tag can belong to only one bucket.");
        return this with { Tags = Tags.Select(t => t with { Key = t.Key.Trim(), Name = t.Name.Trim(), Missing = false }).ToList() };
    }
}

public static class SettingsStore
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    public static async Task<NuditySettings> LoadAsync(IExtensionStore store, CancellationToken ct = default)
    {
        var payload = await store.GetAsync("settings", ct);
        return string.IsNullOrWhiteSpace(payload) ? NuditySettings.Defaults() : (JsonSerializer.Deserialize<NuditySettings>(payload, Json)
            ?? throw new InvalidOperationException("Nudity Level settings could not be read.")).Validate();
    }
    public static Task SaveAsync(IExtensionStore store, NuditySettings settings, CancellationToken ct) => store.SetAsync("settings", JsonSerializer.Serialize(settings.Validate(), Json), ct);

    // Bound IDs survive renames; deleted IDs never silently bind to another tag.
    public static async Task<NuditySettings> ResolveAsync(CoveContext db, NuditySettings settings, CancellationToken ct = default)
    {
        var ids = settings.Tags.Where(t => t.TagId.HasValue).Select(t => t.TagId!.Value).ToArray();
        var names = settings.Tags.Where(t => t.TagId == null).Select(t => t.Name.ToLowerInvariant()).ToArray();
        var candidates = await db.Tags.AsNoTracking().Where(t => ids.Contains(t.Id) || names.Contains(t.Name.ToLower())
            || t.Aliases.Any(a => names.Contains(a.Alias.ToLower())))
            .Select(t => new { t.Id, t.Name, Aliases = t.Aliases.Select(a => a.Alias).ToArray() }).ToListAsync(ct);
        var used = new HashSet<int>();
        return settings with { Tags = settings.Tags.Select(rule => {
            var matches = candidates.Where(t => rule.TagId.HasValue ? t.Id == rule.TagId
                : t.Name.Equals(rule.Name, StringComparison.OrdinalIgnoreCase) || t.Aliases.Contains(rule.Name, StringComparer.OrdinalIgnoreCase)).ToList();
            if (matches.Count != 1 || !used.Add(matches[0].Id)) return rule with { Missing = true };
            return rule with { TagId = matches[0].Id, Name = matches[0].Name, Missing = false };
        }).ToList() };
    }
}

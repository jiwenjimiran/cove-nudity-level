using System.Text.Json;
using Cove.Core.Entities;
using Cove.Data;
using Microsoft.EntityFrameworkCore;

namespace Cove.NudityLevel;

public sealed record Evidence(int HostId, int TagId, string SourceKey, string ModelKey, string SourceRunId);
public static class Classification
{
    public static bool IsAi(string source) => source.StartsWith("ext:ai.", StringComparison.OrdinalIgnoreCase)
        || source.StartsWith("ai:", StringComparison.OrdinalIgnoreCase);
    public static bool IsManual(string source) => source is "user" or "manual";
    public static bool IsBodyKey(string key) => key.Equals("body_20", StringComparison.OrdinalIgnoreCase)
        || key.Equals("bodyparts", StringComparison.OrdinalIgnoreCase);
    public static bool HasBodyModel(JsonDocument? models) => models?.RootElement.ValueKind == JsonValueKind.Array
        && models.RootElement.EnumerateArray().Any(m => m.ValueKind == JsonValueKind.Object &&
            new[] { "config_name", "name" }.Any(k => m.TryGetProperty(k, out var v) && v.ValueKind == JsonValueKind.String && IsBodyKey(v.GetString()!)));

    public static string Level(NuditySettings settings, IEnumerable<int> tagIds, bool analyzed)
    {
        var present = tagIds.ToHashSet();
        var tags = settings.Tags.Where(t => !t.Missing && t.TagId.HasValue && present.Contains(t.TagId.Value)).ToArray();
        var result = analyzed || tags.Any(t => t.EstablishesCoverage || t.Bucket != "neutral") ? 1 : 0;
        foreach (var tag in tags) if (tag.Bucket != "neutral") result = Math.Max(result, Array.IndexOf(NuditySettings.Levels, tag.Bucket));
        if (settings.SchemaVersion == 1 && settings.CombinationEnabled && tags.Any(t => t.Genital) && tags.Any(t => t.Nipple)) result = 5;
        var keys = tags.Select(t => t.Key).ToHashSet();
        foreach (var rule in settings.Rules ?? []) if (rule.Enabled && rule.Groups.Count > 0 && rule.Groups.All(g => g.Count > 0 && g.Any(keys.Contains)))
            result = Math.Max(result, Array.IndexOf(NuditySettings.Levels, rule.Level));
        return NuditySettings.Levels[result];
    }

    public static string FromEvidence(NuditySettings settings, IEnumerable<Evidence> evidence, bool bodyCompleted, IReadOnlySet<string> unsuccessfulRuns)
    {
        var configured = settings.Tags.Where(t => !t.Missing && t.TagId.HasValue).Select(t => t.TagId!.Value).ToHashSet();
        var rows = evidence.ToArray();
        var ai = rows.Where(e => IsAi(e.SourceKey) && !unsuccessfulRuns.Contains(e.SourceRunId)
            && (configured.Contains(e.TagId) || IsBodyKey(e.ModelKey))).ToArray();
        var aiLevel = Level(settings, ai.Select(e => e.TagId), bodyCompleted || ai.Any(e => IsBodyKey(e.ModelKey)));
        if (aiLevel != "unknown") return aiLevel;
        return Level(settings, rows.Where(e => IsManual(e.SourceKey)).Select(e => e.TagId), false);
    }

    public static async Task<Dictionary<int, string>> LoadAsync(CoveContext db, string kind, int[] ids, NuditySettings settings, CancellationToken ct = default)
    {
        var host = kind == "video" ? AffinityHostType.Video : AffinityHostType.Image;
        var target = kind == "video" ? AiRunTargetType.Video : AiRunTargetType.Image;
        var rows = await db.TagApplications.AsNoTracking().Where(t => t.HostType == host && ids.Contains(t.HostId) && t.ContextType == null)
            .Select(t => new Evidence(t.HostId, t.TagId, t.SourceKey, t.ModelKey, t.SourceRunId)).ToListAsync(ct);
        var runs = await db.AiRuns.AsNoTracking().Where(r => r.TargetType == target && ids.Contains(r.TargetId))
            .Select(r => new { r.TargetId, r.RunKey, r.Status, r.Models }).ToListAsync(ct);
        var completed = runs.Where(r => r.Status == AiRunStatus.Completed && HasBodyModel(r.Models)).Select(r => r.TargetId).ToHashSet();
        var unsuccessful = runs.Where(r => r.Status != AiRunStatus.Completed).Select(r => r.RunKey).ToHashSet();
        var grouped = rows.ToLookup(r => r.HostId);
        return ids.ToDictionary(id => id, id => FromEvidence(settings, grouped[id], completed.Contains(id), unsuccessful));
    }
}

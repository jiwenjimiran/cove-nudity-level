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
        var rules = settings.Tags.Where(t => !t.Missing && t.TagId.HasValue && present.Contains(t.TagId.Value)).ToArray();
        if (rules.Any(t => t.Bucket == "full") || settings.CombinationEnabled && rules.Any(t => t.Genital) && rules.Any(t => t.Nipple)) return "full";
        foreach (var bucket in new[] { "high", "medium", "low" }) if (rules.Any(t => t.Bucket == bucket)) return bucket;
        return analyzed || rules.Length > 0 ? "none" : "unknown";
    }

    public static string FromEvidence(NuditySettings settings, IEnumerable<Evidence> evidence, bool bodyCompleted, IReadOnlySet<string> unsuccessfulRuns)
    {
        var configured = settings.Tags.Where(t => !t.Missing && t.TagId.HasValue).Select(t => t.TagId!.Value).ToHashSet();
        var rows = evidence.ToArray();
        var ai = rows.Where(e => IsAi(e.SourceKey) && !unsuccessfulRuns.Contains(e.SourceRunId)
            && (configured.Contains(e.TagId) || IsBodyKey(e.ModelKey))).ToArray();
        if (bodyCompleted || ai.Length > 0) return Level(settings, ai.Select(e => e.TagId), true);
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

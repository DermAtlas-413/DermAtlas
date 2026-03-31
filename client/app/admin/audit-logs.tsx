import React, { useState, useEffect } from "react";
import {
  SafeAreaView,
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  TextInput,
  ActivityIndicator,
  Platform,
  ScrollView,
} from "react-native";
import { useRouter } from "expo-router";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { DermAtlasColors as D } from "@/constants/theme";
import type { AuditLogEntry } from "@/types/admin";
import { getAuditLogs } from "@/services/audit-service";

type DateFilter = "today" | "7d" | "30d" | "all";

const DATE_FILTER_OPTIONS: { key: DateFilter; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 days" },
  { key: "30d", label: "Last 30 days" },
  { key: "all", label: "All" },
];

function getDateRange(filter: DateFilter): { from?: string; to?: string } {
  const now = new Date();
  const to = now.toISOString();
  if (filter === "all") return {};
  if (filter === "today") {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    return { from, to };
  }
  const days = filter === "7d" ? 7 : 30;
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  return { from, to };
}

const PAGE_SIZE = 20;

export default function AuditLogs() {
  const router = useRouter();

  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dateFilter, setDateFilter] = useState<DateFilter>("7d");
  const [actionSearch, setActionSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
    setEntries([]);
    setLoading(true);
    setError(null);
    const range = getDateRange(dateFilter);
    getAuditLogs({
      page: 1,
      limit: PAGE_SIZE,
      action: actionSearch || undefined,
      ...range,
    })
      .then((result) => {
        setEntries(result.entries);
        setTotal(result.total);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load audit logs.");
      })
      .finally(() => setLoading(false));
  }, [dateFilter, actionSearch]);

  async function fetchPage(p: number, reset: boolean) {
    if (reset) {
      setLoading(true);
      setError(null);
    } else {
      setLoadingMore(true);
    }
    try {
      const range = getDateRange(dateFilter);
      const result = await getAuditLogs({
        page: p,
        limit: PAGE_SIZE,
        action: actionSearch || undefined,
        ...range,
      });
      if (reset) {
        setEntries(result.entries);
      } else {
        setEntries((prev) => [...prev, ...result.entries]);
      }
      setTotal(result.total);
      setPage(p);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load audit logs.");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  function loadMore() {
    if (entries.length < total && !loadingMore) {
      fetchPage(page + 1, false);
    }
  }

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={() => router.back()}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={D.onPrimary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Audit Logs</Text>
          <Text style={styles.headerSubtitle}>System access & activity history</Text>
        </View>
        <View style={styles.headerBtn} />
      </View>

      <View style={styles.noticeBanner}>
        <MaterialCommunityIcons name="shield-lock-outline" size={14} color={D.primary} />
        <Text style={styles.noticeText}>
          Audit logs are read-only. All access to this page is monitored.
        </Text>
      </View>

      <View style={styles.filterSection}>
        <View style={styles.dateFilterRow}>
          {DATE_FILTER_OPTIONS.map(({ key, label }) => (
            <Pressable
              key={key}
              style={[styles.filterChip, dateFilter === key && styles.filterChipActive]}
              onPress={() => setDateFilter(key)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  dateFilter === key && styles.filterChipTextActive,
                ]}
              >
                {label}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.actionSearchRow}>
          <MaterialCommunityIcons name="magnify" size={16} color={D.muted} />
          <TextInput
            style={styles.actionSearchInput}
            value={actionSearch}
            onChangeText={setActionSearch}
            placeholder="Filter by action…"
            placeholderTextColor={D.muted}
            autoCorrect={false}
          />
          {actionSearch.length > 0 && (
            <Pressable onPress={() => setActionSearch("")}>
              <MaterialCommunityIcons name="close-circle" size={16} color={D.muted} />
            </Pressable>
          )}
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={D.primary} size="large" />
          <Text style={styles.loadingText}>Loading logs…</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <MaterialCommunityIcons name="alert-circle-outline" size={40} color={D.danger} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={() => fetchPage(1, true)}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      ) : Platform.OS === "web" ? (
        <WebLogList
          entries={entries}
          total={total}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
          expandedId={expandedId}
          onToggleExpand={toggleExpand}
        />
      ) : (
        <MobileLogList
          entries={entries}
          total={total}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
          expandedId={expandedId}
          onToggleExpand={toggleExpand}
          onRefresh={() => fetchPage(1, true)}
        />
      )}
    </SafeAreaView>
  );
}

function WebLogList({
  entries,
  total,
  loadingMore,
  onLoadMore,
  expandedId,
  onToggleExpand,
}: {
  entries: AuditLogEntry[];
  total: number;
  loadingMore: boolean;
  onLoadMore: () => void;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
}) {
  return (
    <ScrollView contentContainerStyle={styles.webContainer}>
      <Text style={styles.totalCount}>
        Showing {entries.length} of {total} entries
      </Text>
      <View style={styles.tableCard}>
        <View style={styles.tableHeader}>
          <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Timestamp</Text>
          <Text style={[styles.tableHeaderCell, { flex: 2 }]}>User</Text>
          <Text style={[styles.tableHeaderCell, { flex: 3 }]}>Action</Text>
          <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Resource</Text>
          <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: "center" }]}>
            Status
          </Text>
        </View>

        {entries.length === 0 ? (
          <View style={styles.emptyRow}>
            <Text style={styles.emptyText}>No log entries match your filters.</Text>
          </View>
        ) : (
          entries.map((entry, idx) => (
            <WebLogRow
              key={entry.log_id}
              entry={entry}
              isLast={idx === entries.length - 1}
              expanded={expandedId === entry.log_id}
              onToggle={() => onToggleExpand(entry.log_id)}
            />
          ))
        )}
      </View>

      {entries.length < total && (
        <Pressable
          style={[styles.loadMoreBtn, loadingMore && styles.loadMoreBtnDisabled]}
          onPress={onLoadMore}
          disabled={loadingMore}
        >
          {loadingMore ? (
            <ActivityIndicator color={D.primary} size="small" />
          ) : (
            <Text style={styles.loadMoreBtnText}>Load More</Text>
          )}
        </Pressable>
      )}
    </ScrollView>
  );
}

function WebLogRow({
  entry,
  isLast,
  expanded,
  onToggle,
}: {
  entry: AuditLogEntry;
  isLast: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={[!isLast && styles.tableRowBorder]}>
      <Pressable
        style={({ pressed }) => [
          styles.tableRow,
          pressed && styles.tableRowPressed,
          expanded && styles.tableRowExpanded,
        ]}
        onPress={onToggle}
      >
        <Text style={[styles.tableCell, styles.tableCellMono, { flex: 2 }]}>
          {formatDateTime(entry.timestamp)}
        </Text>
        <Text style={[styles.tableCell, { flex: 2 }]} numberOfLines={1}>
          {entry.user_name}
        </Text>
        <Text style={[styles.tableCell, { flex: 3 }]} numberOfLines={1}>
          {entry.action}
        </Text>
        <Text style={[styles.tableCell, styles.tableCellMuted, { flex: 2 }]} numberOfLines={1}>
          {entry.resource_type} · {entry.resource_id}
        </Text>
        <View style={{ flex: 1, alignItems: "center" }}>
          <StatusIcon status={entry.status} />
        </View>
      </Pressable>
      {expanded && (
        <View style={styles.expandedDetail}>
          <DetailRow label="Log ID" value={entry.log_id} />
          <DetailRow label="IP Address" value={entry.ip_address ?? "N/A"} />
          <DetailRow label="User ID" value={entry.user_id} />
          <DetailRow label="Full Timestamp" value={entry.timestamp} />
        </View>
      )}
    </View>
  );
}

function MobileLogList({
  entries,
  total,
  loadingMore,
  onLoadMore,
  expandedId,
  onToggleExpand,
  onRefresh,
}: {
  entries: AuditLogEntry[];
  total: number;
  loadingMore: boolean;
  onLoadMore: () => void;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
  onRefresh: () => void;
}) {
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  }

  return (
    <FlatList
      data={entries}
      keyExtractor={(e) => e.log_id}
      contentContainerStyle={styles.mobileList}
      onRefresh={handleRefresh}
      refreshing={refreshing}
      ListHeaderComponent={
        <Text style={styles.totalCount}>
          {entries.length} of {total} entries
        </Text>
      }
      ListEmptyComponent={
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No log entries match your filters.</Text>
        </View>
      }
      ListFooterComponent={
        entries.length < total ? (
          <Pressable
            style={[styles.loadMoreBtn, loadingMore && styles.loadMoreBtnDisabled]}
            onPress={onLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? (
              <ActivityIndicator color={D.primary} size="small" />
            ) : (
              <Text style={styles.loadMoreBtnText}>Load More</Text>
            )}
          </Pressable>
        ) : null
      }
      renderItem={({ item }) => {
        const expanded = expandedId === item.log_id;
        return (
          <Pressable
            style={({ pressed }) => [
              styles.mobileCard,
              pressed && styles.mobileCardPressed,
            ]}
            onPress={() => onToggleExpand(item.log_id)}
          >
            <View style={styles.mobileCardTop}>
              <View style={styles.mobileCardTopLeft}>
                <Text style={styles.mobileCardAction}>{item.action}</Text>
                <Text style={styles.mobileCardMeta}>
                  {item.user_name} · {formatDateTime(item.timestamp)}
                </Text>
              </View>
              <StatusIcon status={item.status} />
            </View>
            <View style={styles.mobileCardResourceRow}>
              <MaterialCommunityIcons name="file-outline" size={13} color={D.muted} />
              <Text style={styles.mobileCardResource}>
                {item.resource_type} · {item.resource_id}
              </Text>
            </View>
            {expanded && (
              <View style={styles.mobileExpandedDetail}>
                <DetailRow label="Log ID" value={item.log_id} />
                <DetailRow label="IP Address" value={item.ip_address ?? "N/A"} />
                <DetailRow label="User ID" value={item.user_id} />
              </View>
            )}
          </Pressable>
        );
      }}
    />
  );
}

function StatusIcon({ status }: { status: "success" | "failure" }) {
  return status === "success" ? (
    <MaterialCommunityIcons name="check-circle" size={18} color={D.success} />
  ) : (
    <MaterialCommunityIcons name="close-circle" size={18} color={D.danger} />
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: D.bg },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: D.primary,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: D.onPrimaryOverlay,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { color: D.onPrimary, fontWeight: "700", fontSize: 17 },
  headerSubtitle: { color: D.onPrimaryMuted, fontSize: 11, fontWeight: "500" },

  noticeBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: D.infoSurface,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: D.border,
  },
  noticeText: { fontSize: 12, color: D.primary, flex: 1 },

  filterSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    backgroundColor: D.surface,
    borderBottomWidth: 1,
    borderBottomColor: D.border,
  },
  dateFilterRow: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: D.border,
    backgroundColor: D.bg,
  },
  filterChipActive: { backgroundColor: D.primary, borderColor: D.primary },
  filterChipText: { fontSize: 12, fontWeight: "600", color: D.muted },
  filterChipTextActive: { color: D.onPrimary },
  actionSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1.5,
    borderColor: D.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 38,
    backgroundColor: D.bg,
  },
  actionSearchInput: { flex: 1, color: D.text, fontSize: 14 },

  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 20 },
  loadingText: { color: D.muted, fontSize: 14 },
  errorText: { color: D.danger, fontSize: 14, textAlign: "center" },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: D.primary,
  },
  retryBtnText: { color: D.onPrimary, fontWeight: "600" },

  totalCount: { fontSize: 12, color: D.muted, marginBottom: 8 },

  // Web layout
  webContainer: { padding: 20, gap: 8 },
  tableCard: {
    backgroundColor: D.surface,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: D.border,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: D.bg,
    borderBottomWidth: 1.5,
    borderBottomColor: D.border,
  },
  tableHeaderCell: {
    fontSize: 11,
    fontWeight: "700",
    color: D.muted,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tableRowBorder: { borderBottomWidth: 1, borderBottomColor: D.border },
  tableRowPressed: { backgroundColor: D.bg },
  tableRowExpanded: { backgroundColor: D.infoSurface },
  tableCell: { fontSize: 13, color: D.text },
  tableCellMono: { fontVariant: ["tabular-nums"], fontSize: 12 },
  tableCellMuted: { color: D.muted },
  emptyRow: { padding: 32, alignItems: "center" },
  emptyText: { color: D.muted, fontSize: 14 },

  expandedDetail: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: D.bg,
    borderTopWidth: 1,
    borderTopColor: D.border,
    gap: 6,
  },

  // Mobile layout
  mobileList: { padding: 16, gap: 8, paddingBottom: 24 },
  mobileCard: {
    backgroundColor: D.surface,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: D.border,
    padding: 14,
    gap: 6,
  },
  mobileCardPressed: { backgroundColor: D.bg },
  mobileCardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  mobileCardTopLeft: { flex: 1, gap: 3 },
  mobileCardAction: { fontSize: 14, fontWeight: "600", color: D.text },
  mobileCardMeta: { fontSize: 12, color: D.muted },
  mobileCardResourceRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  mobileCardResource: { fontSize: 12, color: D.muted },
  mobileExpandedDetail: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: D.border,
    gap: 6,
  },

  detailRow: { flexDirection: "row", gap: 8 },
  detailLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: D.muted,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    minWidth: 80,
  },
  detailValue: { fontSize: 12, color: D.text, flex: 1 },

  loadMoreBtn: {
    marginTop: 12,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: D.border,
    alignItems: "center",
    backgroundColor: D.surface,
  },
  loadMoreBtnDisabled: { opacity: 0.6 },
  loadMoreBtnText: { fontSize: 14, fontWeight: "600", color: D.primary },
});

"use client";

import { AnimatePresence, LazyMotion, MotionConfig, domAnimation, m } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { normalizeName } from "./domain";
import { isDraftExpired, mergeDrafts, offlineStore } from "./offline-db";
import { signOut } from "./sign-out";
import {
  initialForm,
  type AppUser,
  type Client,
  type DraftRecord,
  type MonthCycleState,
  type OrderRecord,
  type SyncState,
} from "./types";
import { AdminScreen } from "./ui/admin";
import { AuthScreen, PasswordChange, readJson } from "./ui/auth";
import { FullLogo } from "./ui/brand";
import { buildClientReport, clientReportFilename, downloadBlob, shareOrDownload } from "./ui/client-report";
import { ClientDetailScreen, ClientsScreen } from "./ui/clients";
import { HistoryScreen } from "./ui/history";
import { HomeScreen } from "./ui/home";
import { monthLabel, ordersInMonth } from "./ui/insights";
import { NewOrder, normalizeForm } from "./ui/new-order";
import { OrderSheet } from "./ui/orders";
import { OSPreview } from "./ui/os-preview";
import { ReportsScreen } from "./ui/reports";
import { AppShell, type Screen } from "./ui/shell";

type DraftError = {
  code?: "ORDER_FINALIZED" | "CLIENT_BUSY";
  error?: string;
  draft?: DraftRecord;
};

const emptyCycle: MonthCycleState = { cycle: null, completions: [] };

export default function TecnoramosApp() {
  const [account, setAccount] = useState<AppUser | null>(null);
  const [canBootstrap, setCanBootstrap] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>("online");
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [trashOrders, setTrashOrders] = useState<OrderRecord[]>([]);
  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [technicians, setTechnicians] = useState<AppUser[]>([]);
  const [monthCycle, setMonthCycle] = useState<MonthCycleState>(emptyCycle);
  const [screen, setScreen] = useState<Screen>("home");
  const [selectedOrder, setSelectedOrder] = useState<{ order: OrderRecord; trash: boolean } | null>(null);
  const [shareOnOpen, setShareOnOpen] = useState(false);
  const [openClientId, setOpenClientId] = useState<string | null>(null);
  const [reportBusyId, setReportBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState("");
  const [activeDraft, setActiveDraft] = useState<DraftRecord | null>(null);
  const [correctionOf, setCorrectionOf] = useState<OrderRecord | null>(null);
  const [correctionReason, setCorrectionReason] = useState("");
  const [viewingOrder, setViewingOrder] = useState<OrderRecord | null>(null);

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }, []);

  const cacheSharedData = useCallback(async (
    user: AppUser,
    nextOrders: OrderRecord[],
    nextClients: Client[],
    nextTechnicians: AppUser[],
    nextDrafts: DraftRecord[],
  ) => {
    await Promise.all([
      offlineStore.setProfile(user),
      offlineStore.setOrders(user.username, nextOrders),
      offlineStore.setClients(nextClients),
      offlineStore.setTechnicians(nextTechnicians),
      offlineStore.setDrafts(user.username, nextDrafts),
    ]);
  }, []);

  const syncLocalDrafts = useCallback(async (user: AppUser) => {
    const stored = await offlineStore.getDrafts(user.username) ?? [];
    const cached = stored.filter((draft) => !isDraftExpired(draft));
    if (cached.length !== stored.length) await offlineStore.setDrafts(user.username, cached);
    const pending = cached.filter((draft) => draft.status === "sync_pending");
    if (!pending.length || !navigator.onLine) return cached;

    let synchronized = cached;
    for (const draft of pending) {
      try {
        const response = await fetch("/api/drafts", {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(draft),
        });
        const result = await response.json().catch(() => ({})) as DraftError & { draft?: DraftRecord };
        if (response.ok && result.draft) {
          synchronized = [
            result.draft,
            ...synchronized.filter((item) => item.clientRequestId !== draft.clientRequestId),
          ];
          continue;
        }
        if (result.code === "ORDER_FINALIZED") {
          synchronized = synchronized.filter((item) => item.clientRequestId !== draft.clientRequestId);
          continue;
        }
        if (result.code === "CLIENT_BUSY" && result.draft) {
          synchronized = [
            result.draft,
            ...synchronized.filter((item) => item.clientRequestId !== draft.clientRequestId),
          ];
        }
      } catch {
        // The pending copy remains on this device for the next synchronization.
      }
    }
    await offlineStore.setDrafts(user.username, synchronized);
    return synchronized;
  }, []);

  const loadData = useCallback(async (user: AppUser, quiet = false) => {
    // The server only answers once the temporary password has been replaced.
    if (user.mustChangePassword) return;
    if (!navigator.onLine) {
      setSyncState("offline");
      const [cachedOrders, cachedClients, cachedTechnicians, cachedDrafts, pending] = await Promise.all([
        offlineStore.getOrders(user.username),
        offlineStore.getClients(),
        offlineStore.getTechnicians(),
        offlineStore.getDrafts(user.username),
        offlineStore.getPendingOrders(user.username),
      ]);
      setOrders([...(pending ?? []), ...(cachedOrders ?? [])]);
      setClients(cachedClients ?? []);
      setTechnicians(cachedTechnicians ?? [user]);
      setDrafts(cachedDrafts ?? []);
      return;
    }

    try {
      if (!quiet) setSyncState("syncing");
      const localDrafts = await syncLocalDrafts(user);
      const [ordersResponse, draftsResponse, clientsResponse, usersResponse, cycleResponse] = await Promise.all([
        fetch("/api/orders", { cache: "no-store" }),
        fetch("/api/drafts", { cache: "no-store" }),
        fetch("/api/clients", { cache: "no-store" }),
        fetch("/api/users?scope=technicians", { cache: "no-store" }),
        fetch("/api/month-cycle", { cache: "no-store" }),
      ]);
      const [orderResult, draftResult, clientResult, userResult, cycleResult] = await Promise.all([
        readJson<{ orders: OrderRecord[] }>(ordersResponse),
        readJson<{ drafts: DraftRecord[] }>(draftsResponse),
        readJson<{ clients: Client[] }>(clientsResponse),
        readJson<{ users: AppUser[] }>(usersResponse),
        readJson<MonthCycleState>(cycleResponse),
      ]);
      const mergedDrafts = mergeDrafts(draftResult.drafts, localDrafts);
      const pending = await offlineStore.getPendingOrders(user.username);
      setOrders([...(pending ?? []), ...orderResult.orders]);
      setDrafts(mergedDrafts);
      setClients(clientResult.clients);
      setTechnicians(userResult.users);
      setMonthCycle(cycleResult);
      setSyncState("online");
      await cacheSharedData(
        user,
        orderResult.orders,
        clientResult.clients,
        userResult.users,
        mergedDrafts,
      );
    } catch {
      setSyncState("offline");
      const [cachedOrders, cachedClients, cachedTechnicians, cachedDrafts, pending] = await Promise.all([
        offlineStore.getOrders(user.username),
        offlineStore.getClients(),
        offlineStore.getTechnicians(),
        offlineStore.getDrafts(user.username),
        offlineStore.getPendingOrders(user.username),
      ]);
      setOrders([...(pending ?? []), ...(cachedOrders ?? [])]);
      setClients(cachedClients ?? []);
      setTechnicians(cachedTechnicians ?? [user]);
      setDrafts(cachedDrafts ?? []);
      if (!quiet) notify("Sem conexão. Exibindo os dados salvos neste aparelho.");
    }
  }, [cacheSharedData, notify, syncLocalDrafts]);

  const syncPendingOrders = useCallback(async (user: AppUser) => {
    if (!navigator.onLine || user.mustChangePassword) return;
    const pending = await offlineStore.getPendingOrders(user.username) ?? [];
    if (!pending.length) return;
    setSyncState("syncing");
    const remaining: OrderRecord[] = [];
    let synchronized = 0;
    for (const pendingOrder of pending) {
      try {
        const result = await readJson<{ order: OrderRecord }>(await fetch("/api/orders", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...pendingOrder.data,
            clientId: pendingOrder.clientId,
            clientName: pendingOrder.clientName,
            clientRequestId: pendingOrder.clientRequestId,
            correctedFromId: pendingOrder.correctedFromId,
            correctionReason: pendingOrder.correctionReason,
          }),
        }));
        if (result.order) synchronized += 1;
      } catch {
        remaining.push(pendingOrder);
      }
    }
    await offlineStore.setPendingOrders(user.username, remaining);
    if (synchronized) {
      notify(`${synchronized} OS sincronizada${synchronized > 1 ? "s" : ""} com sucesso.`);
      await loadData(user, true);
    } else {
      setSyncState(remaining.length ? "offline" : "online");
    }
  }, [loadData, notify]);

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      try {
        const result = await readJson<{ user: AppUser | null; canBootstrap: boolean }>(
          await fetch("/api/auth", { cache: "no-store" }),
        );
        if (cancelled) return;
        setCanBootstrap(result.canBootstrap);
        if (result.user) {
          setAccount(result.user);
          await offlineStore.setProfile(result.user);
          await loadData(result.user);
          await syncPendingOrders(result.user);
        } else {
          await offlineStore.clearProfile();
        }
      } catch {
        const cached = await offlineStore.getProfile();
        if (!cancelled && cached) {
          setAccount(cached);
          setSyncState("offline");
          await loadData(cached);
        }
      } finally {
        if (!cancelled) setAuthReady(true);
      }
    };
    void initialize();
    return () => {
      cancelled = true;
    };
  }, [loadData, syncPendingOrders]);

  useEffect(() => {
    if (!account) return;
    const online = () => {
      setSyncState("syncing");
      void syncPendingOrders(account).then(() => loadData(account, true));
    };
    const offline = () => setSyncState("offline");
    const visibility = () => {
      if (document.visibilityState === "visible" && navigator.onLine) online();
    };
    const interval = window.setInterval(() => {
      if (navigator.onLine) {
        void syncPendingOrders(account).then(() => loadData(account, true));
      }
    }, 15_000);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    window.addEventListener("focus", visibility);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.removeEventListener("focus", visibility);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [account, loadData, syncPendingOrders]);

  const login = async (user: AppUser) => {
    setAccount(user);
    setCanBootstrap(false);
    await offlineStore.setProfile(user);
    await loadData(user);
    await syncPendingOrders(user);
  };

  const logout = async () => {
    if (!account) return;
    const result = await signOut({
      online: navigator.onLine,
      synchronize: async () => {
        await syncPendingOrders(account);
        await syncLocalDrafts(account);
      },
      countUnsynced: () => offlineStore.countUnsynced(account.username),
      confirmKeepingUnsynced: (unsynced) => {
        const plural = unsynced > 1;
        return window.confirm(
          `Este aparelho tem ${unsynced} atendimento${plural ? "s" : ""} ainda não enviado${plural ? "s" : ""} ao servidor. `
          + `${plural ? "Eles continuam guardados" : "Ele continua guardado"} aqui e ${plural ? "serão enviados" : "será enviado"} `
          + `quando ${account.displayName || account.username} entrar novamente com internet. Sair mesmo assim?`,
        );
      },
      endServerSession: async () => {
        try {
          return (await fetch("/api/auth", { method: "DELETE" })).ok;
        } catch {
          return false;
        }
      },
      clearLocalSession: async () => {
        await offlineStore.clearSyncedAccountData(account.username);
        await offlineStore.clearProfile();
      },
    });
    if (result === "offline" || result === "server_unreachable") {
      window.alert(
        "Conecte o aparelho à internet para encerrar a sessão com segurança. "
        + "Seus atendimentos continuam salvos neste aparelho.",
      );
    }
    if (result !== "signed_out") return;
    setAccount(null);
    setOrders([]);
    setDrafts([]);
    setMonthCycle(emptyCycle);
  };

  const navigate = (next: Screen) => {
    setScreen(next);
    setSearch("");
    setOpenClientId(null);
    window.scrollTo({ top: 0 });
  };

  const openPdf = (order: OrderRecord, share = false) => {
    setSelectedOrder(null);
    setShareOnOpen(share);
    setViewingOrder(order);
  };

  const clientReport = async (client: Client, month: string) => {
    setReportBusyId(client.id);
    try {
      const clientOrders = ordersInMonth(orders, month).filter((order) => order.clientId === client.id);
      const label = monthLabel(month);
      const blob = await buildClientReport({ clientName: client.name, month, monthLabel: label, orders: clientOrders });
      const result = await shareOrDownload(blob, clientReportFilename(client.name, month), `Relatório de atendimentos · ${client.name} · ${label}`);
      if (result === "downloaded") notify("Relatório salvo no aparelho.");
    } catch {
      notify("Não foi possível gerar o relatório. Tente novamente.");
    } finally {
      setReportBusyId(null);
    }
  };

  const downloadMonthCsv = (month: string, csv: string) => {
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `tecnoramos-os-${month}.csv`);
    notify("Planilha salva no aparelho.");
  };

  const defaultForm = useCallback((client?: Client) => {
    if (!account) return initialForm;
    return {
      ...initialForm,
      clientId: client?.id ?? null,
      technicianIds: [account.id],
      technicians: [account.displayName || account.username],
    };
  }, [account]);

  const startOrder = (client?: Client) => {
    if (!account) return;
    if (client) {
      const conflict = drafts.find((draft) => draft.clientId === client.id);
      if (conflict) {
        setActiveDraft({ ...conflict, data: normalizeForm(conflict.data) });
        notify(`Continuando o atendimento de ${client.name}.`);
        return;
      }
    }
    const now = Date.now();
    setCorrectionOf(null);
    setCorrectionReason("");
    setActiveDraft({
      id: crypto.randomUUID(),
      clientRequestId: crypto.randomUUID(),
      userId: account.id,
      clientId: client?.id ?? null,
      clientName: client?.name ?? "",
      data: defaultForm(client),
      step: client ? 2 : 1,
      status: "draft",
      createdAt: now,
      updatedAt: now,
      ownerName: account.displayName || account.username,
    });
  };

  const resumeDraft = (draft: DraftRecord) => {
    if (!account) return;
    setCorrectionOf(null);
    setCorrectionReason("");
    setActiveDraft({ ...draft, data: normalizeForm(draft.data) });
  };

  const startCorrection = (order: OrderRecord) => {
    if (!account || account.role !== "admin") return;
    const reason = window.prompt(
      `Informe o motivo da correção da OS-${String(order.orderNumber).padStart(5, "0")}:`,
    )?.trim();
    if (!reason || reason.length < 5) {
      notify("A correção exige um motivo com pelo menos 5 caracteres.");
      return;
    }
    const technicianIds = order.data.technicianIds?.filter((id) => technicians.some((item) => item.id === id)) ?? [];
    const matchedIds = technicianIds.length
      ? technicianIds
      : technicians
        .filter((item) => order.technicians.some((name) => normalizeName(name) === normalizeName(item.displayName || item.username)))
        .map((item) => item.id);
    const now = Date.now();
    setCorrectionOf(order);
    setCorrectionReason(reason);
    setActiveDraft({
      id: crypto.randomUUID(),
      clientRequestId: crypto.randomUUID(),
      userId: account.id,
      clientId: order.clientId,
      clientName: order.clientName,
      data: {
        ...normalizeForm(order.data),
        clientId: order.clientId,
        technicianIds: matchedIds,
        technicians: matchedIds
          .map((id) => technicians.find((item) => item.id === id))
          .filter((item): item is AppUser => Boolean(item))
          .map((item) => item.displayName || item.username),
        signatureDataUrl: "",
        consentConfirmed: false,
        signedAt: null,
      },
      step: 2,
      status: "draft",
      createdAt: now,
      updatedAt: now,
      ownerName: account.displayName || account.username,
    });
  };

  const persistDraft = useCallback(async (draft: DraftRecord, announce = false) => {
    if (!account) return;
    const nextDraft = { ...draft, updatedAt: Date.now() };
    const nextDrafts = [
      nextDraft,
      ...drafts.filter((item) => item.clientRequestId !== nextDraft.clientRequestId),
    ].sort((left, right) => right.updatedAt - left.updatedAt);
    setDrafts(nextDrafts);
    await offlineStore.setDrafts(account.username, nextDrafts);
    if (!navigator.onLine) {
      const pendingDraft = { ...nextDraft, status: "sync_pending" as const };
      const pendingDrafts = [
        pendingDraft,
        ...nextDrafts.filter((item) => item.clientRequestId !== pendingDraft.clientRequestId),
      ];
      setDrafts(pendingDrafts);
      await offlineStore.setDrafts(account.username, pendingDrafts);
      setSyncState("offline");
      if (announce) notify("Rascunho salvo neste aparelho. Será sincronizado quando a internet voltar.");
      return;
    }
    try {
      const response = await fetch("/api/drafts", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(nextDraft),
      });
      const payload = await response.json().catch(() => ({})) as DraftError & { draft?: DraftRecord };
      if (!response.ok) {
        if (payload.code === "ORDER_FINALIZED") {
          const remaining = drafts.filter((item) => item.clientRequestId !== nextDraft.clientRequestId);
          setDrafts(remaining);
          await offlineStore.setDrafts(account.username, remaining);
          setActiveDraft(null);
          notify("Esta OS já foi finalizada em outro aparelho.");
          return;
        }
        if (payload.code === "CLIENT_BUSY" && payload.draft) {
          const existingDraft = { ...payload.draft, data: normalizeForm(payload.draft.data) };
          const remaining = [
            existingDraft,
            ...drafts.filter((item) => item.clientRequestId !== nextDraft.clientRequestId
              && item.clientRequestId !== existingDraft.clientRequestId),
          ];
          setDrafts(remaining);
          await offlineStore.setDrafts(account.username, remaining);
          setActiveDraft(existingDraft);
          notify("Este cliente já tinha um atendimento. Abrimos o rascunho existente.");
          return;
        }
        throw new Error(payload.error || "Não foi possível salvar o rascunho.");
      }
      if (!payload.draft) throw new Error("O servidor não confirmou o rascunho.");
      const savedDraft = payload.draft;
      setDrafts((current) => [
        savedDraft,
        ...current.filter((item) => item.clientRequestId !== savedDraft.clientRequestId),
      ].sort((left, right) => right.updatedAt - left.updatedAt));
      setActiveDraft((current) => current?.clientRequestId === savedDraft.clientRequestId
        ? { ...current, id: savedDraft.id, status: "draft", updatedAt: savedDraft.updatedAt }
        : current);
      if (announce) notify("Rascunho salvo e sincronizado.");
    } catch {
      const pendingDraft = { ...nextDraft, status: "sync_pending" as const };
      const pendingDrafts = [
        pendingDraft,
        ...drafts.filter((item) => item.clientRequestId !== pendingDraft.clientRequestId),
      ];
      setDrafts(pendingDrafts);
      await offlineStore.setDrafts(account.username, pendingDrafts);
      setSyncState("offline");
      if (announce) notify("Rascunho salvo neste aparelho. A sincronização ficou pendente.");
    }
  }, [account, drafts, notify]);

  const discardDraft = async (draft: DraftRecord) => {
    if (!account) return;
    if (draft.userId !== account.id && account.role !== "admin") {
      notify("Somente quem iniciou o atendimento ou um administrador pode descartá-lo.");
      return;
    }
    if (!window.confirm("Descartar este rascunho? Nenhuma OS finalizada será apagada.")) return;
    const remaining = drafts.filter((item) => item.clientRequestId !== draft.clientRequestId);
    setDrafts(remaining);
    await offlineStore.setDrafts(account.username, remaining);
    if (navigator.onLine) {
      await fetch(`/api/drafts?id=${encodeURIComponent(draft.id)}`, { method: "DELETE" }).catch(() => undefined);
    }
    setActiveDraft(null);
    notify("Rascunho descartado.");
  };

  const completeOrder = async (draft: DraftRecord) => {
    if (!account) throw new Error("Sessão não encontrada.");
    const activeClient = clients.find((client) => client.id === draft.data.clientId);
    if (!activeClient) throw new Error("Selecione um cliente ativo.");
    const payload = {
      ...draft.data,
      clientId: activeClient.id,
      clientName: activeClient.name,
      clientRequestId: draft.clientRequestId,
      correctedFromId: correctionOf?.id ?? null,
      correctionReason: correctionOf ? correctionReason : null,
    };

    if (navigator.onLine) {
      try {
        const result = await readJson<{ order: OrderRecord }>(await fetch("/api/orders", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        }));
        if (!result.order) throw new Error("O servidor não confirmou a OS.");
        const remaining = drafts.filter((item) => item.clientRequestId !== draft.clientRequestId);
        await offlineStore.setDrafts(account.username, remaining);
        setDrafts(remaining);
        setActiveDraft(null);
        setCorrectionOf(null);
        setViewingOrder(result.order);
        await loadData(account, true);
        return;
      } catch (cause) {
        if (navigator.onLine) throw cause;
      }
    }

    const now = Date.now();
    const pending: OrderRecord = {
      id: `local-${draft.clientRequestId}`,
      orderNumber: null,
      clientId: activeClient.id,
      clientName: activeClient.name,
      equipment: draft.data.equipmentDescription,
      technicians: draft.data.technicians,
      arrivalTime: draft.data.arrivalTime,
      departureTime: draft.data.departureTime,
      status: "sync_pending",
      createdAt: now,
      finalizedAt: now,
      signedAt: draft.data.signedAt ?? now,
      completedBy: account.username,
      completedByDisplayName: account.displayName || account.username,
      revisionNumber: correctionOf ? correctionOf.revisionNumber + 1 : 1,
      correctedFromId: correctionOf?.id ?? null,
      correctionReason: correctionOf ? correctionReason : null,
      deletedAt: null,
      deletionReason: null,
      clientRequestId: draft.clientRequestId,
      data: { ...draft.data, clientName: activeClient.name },
    };
    const currentPending = await offlineStore.getPendingOrders(account.username) ?? [];
    const nextPending = [
      pending,
      ...currentPending.filter((item) => item.clientRequestId !== pending.clientRequestId),
    ];
    await offlineStore.setPendingOrders(account.username, nextPending);
    const remaining = drafts.filter((item) => item.clientRequestId !== draft.clientRequestId);
    await offlineStore.setDrafts(account.username, remaining);
    setDrafts(remaining);
    setOrders((current) => [pending, ...current.filter((item) => item.clientRequestId !== pending.clientRequestId)]);
    setActiveDraft(null);
    setCorrectionOf(null);
    setSyncState("offline");
    notify("OS salva neste aparelho e aguardando sincronização.");
  };

  const changeOrderTrashState = async (order: OrderRecord, action: "trash" | "restore") => {
    if (!account || account.role !== "admin") return;
    let reason = "";
    if (action === "trash") {
      reason = window.prompt(
        `Informe o motivo para mover a OS-${String(order.orderNumber).padStart(5, "0")} para a lixeira:`,
      )?.trim() ?? "";
      if (reason.length < 3) {
        notify("Informe o motivo da remoção.");
        return;
      }
    }
    if (!navigator.onLine) {
      notify("Esta ação administrativa precisa de internet.");
      return;
    }
    try {
      await readJson(await fetch("/api/orders", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: order.id, action, reason }),
      }));
      notify(action === "trash" ? "OS movida para a lixeira." : "OS restaurada.");
      await loadData(account, true);
      if (action === "restore") {
        setTrashOrders((current) => current.filter((item) => item.id !== order.id));
      }
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Não foi possível alterar a OS.");
    }
  };

  const toggleReview = async (order: OrderRecord, reviewed: boolean) => {
    if (!account || account.role !== "admin") return;
    if (!navigator.onLine) {
      notify("Marcar como conferida precisa de internet.");
      return;
    }
    const mark = (value: boolean) => (item: OrderRecord): OrderRecord => item.id === order.id
      ? {
        ...item,
        reviewedAt: value ? Date.now() : null,
        reviewedBy: value ? account.displayName || account.username : null,
      }
      : item;
    const applyMark = (value: boolean) => {
      setOrders((current) => current.map(mark(value)));
      setSelectedOrder((current) => current && current.order.id === order.id
        ? { ...current, order: mark(value)(current.order) }
        : current);
    };
    applyMark(reviewed);
    try {
      await readJson(await fetch("/api/orders", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: order.id, action: reviewed ? "review" : "unreview" }),
      }));
    } catch (cause) {
      applyMark(!reviewed);
      notify(cause instanceof Error ? cause.message : "Não foi possível alterar a conferência.");
    }
  };

  const loadTrash = async () => {
    if (!account || account.role !== "admin" || !navigator.onLine) return;
    try {
      const result = await readJson<{ orders: OrderRecord[] }>(await fetch("/api/orders?trash=1", { cache: "no-store" }));
      setTrashOrders(result.orders);
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Não foi possível abrir a lixeira.");
    }
  };

  const toggleMonthClient = async (clientName: string, completed: boolean) => {
    if (!account || account.role !== "admin") return;
    if (!navigator.onLine) {
      notify("O controle mensal precisa de internet.");
      return;
    }
    const previous = monthCycle;
    setMonthCycle((current) => ({
      ...current,
      completions: completed
        ? [...current.completions.filter((item) => item.clientName !== clientName), { clientName, completedAt: Date.now() }]
        : current.completions.filter((item) => item.clientName !== clientName),
    }));
    try {
      await readJson(await fetch("/api/month-cycle", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "toggle", clientName, completed }),
      }));
      notify(completed ? `${clientName} marcado como concluído.` : `${clientName} voltou para a lista.`);
    } catch (cause) {
      setMonthCycle(previous);
      notify(cause instanceof Error ? cause.message : "Não foi possível alterar o controle mensal.");
    }
  };

  const resetMonthCompletions = async () => {
    if (!account || account.role !== "admin") return;
    if (!window.confirm(
      "Reiniciar a lista de concluídas? Apenas as marcações serão zeradas. Nenhuma OS será apagada.",
    )) return;
    try {
      const result = await readJson<MonthCycleState>(await fetch("/api/month-cycle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      }));
      setMonthCycle(result);
      notify("Lista de concluídas reiniciada. As ordens continuam no histórico.");
    } catch (cause) {
      notify(cause instanceof Error ? cause.message : "Não foi possível reiniciar a lista.");
    }
  };

  if (!authReady) {
    return (
      <div className="app-loading">
        <FullLogo className="app-loading-logo" />
        <span className="app-loading-bar" aria-hidden="true"><i /></span>
        <span className="sr-only">Carregando</span>
      </div>
    );
  }

  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        {renderContent()}
        <AnimatePresence>
          {toast && (
            <m.div
              key={toast}
              className="toast"
              role="status"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.2 }}
            >
              {toast}
            </m.div>
          )}
        </AnimatePresence>
      </MotionConfig>
    </LazyMotion>
  );

  function renderContent() {
    if (!account) return <AuthScreen canBootstrap={canBootstrap} onAccess={(user) => void login(user)} />;
    if (account.mustChangePassword) {
      return (
        <PasswordChange
          user={account}
          onChanged={(user) => {
            setAccount(user);
            void offlineStore.setProfile(user);
            void loadData(user);
          }}
          onLogout={() => void logout()}
        />
      );
    }

    if (viewingOrder) {
      const client = clients.find((item) => item.id === viewingOrder.clientId)
        ?? { id: viewingOrder.clientId ?? "legacy", name: viewingOrder.clientName, status: "active" as const };
      return (
        <OSPreview
          form={normalizeForm(viewingOrder.data)}
          client={client}
          order={viewingOrder}
          shareOnReady={shareOnOpen}
          notify={notify}
          onBack={() => {
            setViewingOrder(null);
            setShareOnOpen(false);
          }}
        />
      );
    }

    if (activeDraft) {
      return (
        <NewOrder
          draft={activeDraft}
          setDraft={setActiveDraft}
          clients={clients}
          technicians={technicians}
          orders={orders}
          correctionOf={correctionOf}
          onPersist={(draft, announce) => void persistDraft(draft, announce)}
          onDiscard={() => void discardDraft(activeDraft)}
          onComplete={completeOrder}
          onClose={() => setActiveDraft(null)}
        />
      );
    }

    const pendingCount = orders.filter((order) => order.status === "sync_pending").length;
    const openClient = openClientId ? clients.find((client) => client.id === openClientId) : undefined;
    const selectOrder = (order: OrderRecord) => setSelectedOrder({ order, trash: false });

    return (
      <AppShell
        account={account}
        screen={screen}
        syncState={syncState}
        pendingCount={pendingCount}
        onNavigate={navigate}
        onNewOrder={() => startOrder()}
        onLogout={() => void logout()}
      >
        <AnimatePresence mode="wait" initial={false}>
          <m.div
            key={`${screen}:${openClient?.id ?? ""}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
          >
            {screen === "home" && (
              <HomeScreen
                account={account}
                orders={orders}
                drafts={drafts}
                clients={clients}
                monthCycle={monthCycle}
                onStartOrder={startOrder}
                onResume={resumeDraft}
                onDiscard={(draft) => void discardDraft(draft)}
                onSelectOrder={selectOrder}
                onOpenHistory={() => navigate("history")}
                onToggleMonthClient={(clientName, completed) => void toggleMonthClient(clientName, completed)}
                onResetMonthCompletions={() => void resetMonthCompletions()}
              />
            )}
            {screen === "history" && (
              <HistoryScreen
                account={account}
                orders={orders}
                trashOrders={trashOrders}
                search={search}
                setSearch={setSearch}
                onLoadTrash={() => void loadTrash()}
                onSelectOrder={selectOrder}
                onSelectTrashOrder={(order) => setSelectedOrder({ order, trash: true })}
              />
            )}
            {screen === "clients" && !openClient && (
              <ClientsScreen
                clients={clients}
                orders={orders}
                monthCycle={monthCycle}
                search={search}
                setSearch={setSearch}
                onOpenClient={(client) => {
                  setOpenClientId(client.id);
                  window.scrollTo({ top: 0 });
                }}
              />
            )}
            {screen === "clients" && openClient && (
              <ClientDetailScreen
                client={openClient}
                orders={orders}
                monthCycle={monthCycle}
                isAdmin={account.role === "admin"}
                onBack={() => setOpenClientId(null)}
                onStartOrder={startOrder}
                onSelectOrder={selectOrder}
                onToggleReview={(order, reviewed) => void toggleReview(order, reviewed)}
                onMonthlyReport={account.role === "admin" ? (client, month) => void clientReport(client, month) : undefined}
                reportBusy={reportBusyId === openClient.id}
              />
            )}
            {screen === "reports" && account.role === "admin" && (
              <ReportsScreen
                orders={orders}
                clients={clients}
                onClientReport={(client, month) => void clientReport(client, month)}
                onDownloadCsv={downloadMonthCsv}
                busyClientId={reportBusyId}
              />
            )}
            {screen === "admin" && account.role === "admin" && (
              <AdminScreen
                currentUser={account}
                onUsersChanged={async () => {
                  await loadData(account, true);
                }}
                onClientsChanged={async () => {
                  await loadData(account, true);
                }}
                notify={notify}
              />
            )}
          </m.div>
        </AnimatePresence>

        <OrderSheet
          order={selectedOrder?.order ?? null}
          trash={selectedOrder?.trash ?? false}
          account={account}
          onClose={() => setSelectedOrder(null)}
          onOpenPdf={(order) => openPdf(order)}
          onShare={(order) => openPdf(order, true)}
          onToggleReview={(order, reviewed) => void toggleReview(order, reviewed)}
          onCorrect={(order) => {
            setSelectedOrder(null);
            startCorrection(order);
          }}
          onTrash={(order) => {
            setSelectedOrder(null);
            void changeOrderTrashState(order, "trash");
          }}
          onRestore={(order) => {
            setSelectedOrder(null);
            void changeOrderTrashState(order, "restore");
          }}
        />
      </AppShell>
    );
  }
}

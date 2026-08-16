import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import {
  cannedBuyerReply,
  discoveryLeads,
  factory,
  leads as seedLeads,
  makeThread,
  shortCompany,
} from '../data'
import type { Lead } from '../data'
import type { ThreadMessage } from '../data/thread'
import type { DemoRunSnapshot, OpportunityStage } from '@zero-human/contracts'
import {
  activatePilot as activatePilotRequest,
  decideCampaign as decideCampaignRequest,
  getActiveRun,
  loginOwner as loginOwnerRequest,
  draftOutreach as draftOutreachRequest,
  searchBuyers as searchBuyersRequest,
  subscribeToRun,
  type BuyerSearchCompany,
  type BuyerSearchResponse,
} from '../api/runtime'

export type DiscoveryRound = {
  round: number
  region: string
  buyerType: string
  query: string
  companies: BuyerSearchCompany[]
  added: number
  persisted: boolean
}

export type Activity = {
  id: number
  time: string
  text: string
}

/**
 * Scripted "live" events. Deterministic on purpose: the demo behaves the
 * same way every time it is presented, but still looks alive.
 */
const scriptedEvents: Array<
  | { kind: 'activity'; text: string }
  | { kind: 'advance'; leadId: string; status: Lead['status']; lastAction: string }
  | { kind: 'discover'; lead: Lead }
> = [
  {
    kind: 'activity',
    text: 'Main agent cross-checked 214 Hamburg import filings against sofa HS codes',
  },
  {
    kind: 'advance',
    leadId: 'maas',
    status: 'negotiating',
    lastAction: 'Replied: wants oak veneer sample + price for 1 × 40HQ split',
  },
  {
    kind: 'activity',
    text: 'Worker 03 escalated Maas Interiors to negotiation',
  },
  {
    kind: 'discover',
    lead: {
      id: 'brabant',
      company: 'Brabant Wonen',
      city: 'Eindhoven',
      country: 'Netherlands',
      countryCode: 'NL',
      buyer: 'Sanne de Vries',
      title: 'Purchasing',
      focus: 'Sofas + sideboards',
      status: 'sourcing',
      worker: 'Worker 23',
      lastAction: 'Discovered via Rotterdam customs + LinkedIn overlap',
      containers: 'n/a',
    },
  },
  {
    kind: 'activity',
    text: 'New buyer discovered: Brabant Wonen, Eindhoven. Worker 23 assigned',
  },
  {
    kind: 'activity',
    text: 'Worker 14 scheduled a follow-up with Fjord Home for Monday 09:00 CET',
  },
  {
    kind: 'advance',
    leadId: 'linden',
    status: 'contacted',
    lastAction: 'First letter sent, sideboard spec attached',
  },
  {
    kind: 'activity',
    text: 'Worker 02 sent first outreach to Linden & Co, Antwerp',
  },
  {
    kind: 'discover',
    lead: {
      id: 'gota',
      company: 'Göta Möbler AB',
      city: 'Gothenburg',
      country: 'Sweden',
      countryCode: 'SE',
      buyer: 'Erik Lindqvist',
      title: 'Category lead',
      focus: 'Dining chairs',
      status: 'sourcing',
      worker: 'Worker 24',
      lastAction: 'Matched from IMM Cologne exhibitor roll',
      containers: 'n/a',
    },
  },
  {
    kind: 'activity',
    text: 'New buyer discovered: Göta Möbler, Gothenburg. Worker 24 assigned',
  },
  {
    kind: 'activity',
    text: 'Worker 09 sent Oster Wohnen the 40-room hotel trial quote',
  },
  {
    kind: 'advance',
    leadId: 'havn',
    status: 'negotiating',
    lastAction: 'Sample pair approved, discussing container mix',
  },
  {
    kind: 'activity',
    text: 'Worker 16 moved Havn Living to negotiation after sample approval',
  },
]

export type AccessLevel = 'conservative' | 'balanced' | 'autopilot'

type DemoState = {
  leads: Lead[]
  activity: Activity[]
  autopilot: boolean
  setAutopilot: (value: boolean) => void
  accessLevel: AccessLevel
  setAccessLevel: (value: AccessLevel) => void
  thread: ThreadMessage[]
  sendMessage: (body: string) => void
  buyerTyping: boolean
  leadAutonomy: Record<string, boolean>
  setLeadAutonomy: (id: string, value: boolean) => void
  threads: Record<string, ThreadMessage[]>
  sendLeadMessage: (id: string, body: string) => void
  leadTyping: Record<string, boolean>
  startDiscovery: () => number
  searchBuyers: (input?: { query?: string; region?: string; buyerType?: string; maxResults?: number }) => Promise<BuyerSearchResponse>
  discoveryRound: DiscoveryRound | null
  addToPipeline: (company: BuyerSearchCompany) => void
  ensureLeadEmail: (lead: Lead) => Promise<void>
  discoveryRemaining: number
  runtimeRun: DemoRunSnapshot | null
  apiConnected: boolean
  runtimeError: string | null
  loginOwner: (email: string, password: string) => Promise<void>
  activatePilot: () => Promise<void>
  decideCampaign: (decision: 'APPROVE' | 'REJECT') => Promise<void>
}

const DemoContext = createContext<DemoState | null>(null)

function nowLabel() {
  return new Date().toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function seedAutonomy(list: Lead[]): Record<string, boolean> {
  return Object.fromEntries(list.map((lead) => [lead.id, true]))
}

function seedLeadThreads(list: Lead[]): Record<string, ThreadMessage[]> {
  return Object.fromEntries(list.map((lead) => [lead.id, makeThread(lead)]))
}

function runtimeStatus(stage: OpportunityStage): Lead['status'] {
  if (stage === 'RESEARCHING') return 'sourcing'
  if (stage === 'OUTREACH' || stage === 'ENGAGED') return 'contacted'
  if (stage === 'NEGOTIATING' || stage === 'PAUSED') return 'negotiating'
  if (stage === 'LOST') return 'contacted'
  return 'contract'
}

function countryCode(country: string): string {
  return ({ Germany: 'DE', Netherlands: 'NL', France: 'FR', Norway: 'NO', Denmark: 'DK' } as Record<string, string>)[country] ?? 'EU'
}

export function DemoProvider({ children }: { children: ReactNode }) {
  const [leads, setLeads] = useState<Lead[]>(seedLeads)
  const [activity, setActivity] = useState<Activity[]>([
    { id: 0, time: nowLabel(), text: 'Main agent searching 12 sources for new buyers' },
  ])
  const [accessLevel, setAccessLevel] = useState<AccessLevel>('autopilot')
  const autopilot = accessLevel === 'autopilot'
  const setAutopilot = useCallback((value: boolean) => {
    setAccessLevel(value ? 'autopilot' : 'balanced')
  }, [])
  const [threads, setThreads] = useState<Record<string, ThreadMessage[]>>(() =>
    seedLeadThreads(seedLeads),
  )
  const [leadAutonomy, setLeadAutonomyMap] = useState<Record<string, boolean>>(() =>
    seedAutonomy(seedLeads),
  )
  const [leadTyping, setLeadTyping] = useState<Record<string, boolean>>({})
  const [runtimeRun, setRuntimeRun] = useState<DemoRunSnapshot | null>(null)
  const [apiConnected, setApiConnected] = useState(false)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const [discoveryRound, setDiscoveryRound] = useState<DiscoveryRound | null>(null)
  const eventIndex = useRef(0)
  const activityId = useRef(1)
  const replyTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  const pendingReplies = useRef<Record<string, number>>({})
  const leadsRef = useRef(leads)
  const threadsRef = useRef(threads)
  const draftingRef = useRef(new Set<string>())
  const msgSeq = useRef(0)
  const runtimeOrder = useRef<{ runId: string; sequence: number; updatedAt: number } | null>(null)
  leadsRef.current = leads
  threadsRef.current = threads

  const applyRuntime = useCallback((snapshot: DemoRunSnapshot) => {
    const nextOrder = {
      runId: snapshot.id,
      sequence: snapshot.timeline.reduce((highest, event) => Math.max(highest, event.sequence), 0),
      updatedAt: Date.parse(snapshot.updatedAt),
    }
    const currentOrder = runtimeOrder.current
    if (
      currentOrder?.runId === nextOrder.runId
      && (
        nextOrder.sequence < currentOrder.sequence
        || (nextOrder.sequence === currentOrder.sequence && nextOrder.updatedAt < currentOrder.updatedAt)
      )
    ) {
      return
    }
    runtimeOrder.current = nextOrder

    const runtimeLeads = snapshot.opportunities.map((opportunity): Lead => ({
      id: opportunity.id,
      company: opportunity.company,
      city: opportunity.city ?? opportunity.country,
      country: opportunity.country,
      countryCode: countryCode(opportunity.country),
      buyer: opportunity.researchOnly ? 'Research only' : opportunity.contactName,
      title: opportunity.researchOnly ? 'Research candidate' : 'Consenting role-player',
      focus: opportunity.focus,
      status: runtimeStatus(opportunity.stage),
      worker: opportunity.researchOnly
        ? 'Research only'
        : opportunity.stage === 'PAUSED'
          ? 'Policy Reviewer'
          : 'Agent team',
      lastAction: opportunity.stageReason ?? opportunity.stage.replaceAll('_', ' ').toLowerCase(),
      containers: opportunity.company === 'Nordlicht Import GmbH' ? '2 × 40HQ' : 'n/a',
      featured: opportunity.company === 'Nordlicht Import GmbH',
      runtimeStage: opportunity.stage,
    }))

    setRuntimeRun(snapshot)
    setApiConnected(true)
    setRuntimeError(null)
    setLeads(runtimeLeads)
    setLeadAutonomyMap(Object.fromEntries(runtimeLeads.map((lead) => [lead.id, true])))
    setThreads((current) => {
      const next: Record<string, ThreadMessage[]> = {}
      for (const lead of runtimeLeads) {
        const existing = current[lead.id] ?? []
        next[lead.id] = existing.some((message) => message.source === 'llm') ? existing : []
      }
      return next
    })
    setLeadTyping({})
    setActivity(
      snapshot.timeline.slice(0, 8).map((event) => ({
        id: event.sequence,
        time: new Date(event.occurredAt).toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        text: event.summary,
      })),
    )
  }, [])

  useEffect(() => {
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    const loadActiveRun = () => {
      void getActiveRun()
        .then((snapshot) => {
          if (cancelled) return
          if (snapshot) {
            applyRuntime(snapshot)
            return
          }
          retryTimer = setTimeout(loadActiveRun, 5_000)
        })
        .catch((error: unknown) => {
          if (cancelled) return
          setRuntimeError(error instanceof Error ? error.message : 'Runtime API unavailable')
          retryTimer = setTimeout(loadActiveRun, 5_000)
        })
    }
    loadActiveRun()
    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [applyRuntime])

  const runtimeRunId = runtimeRun?.id

  useEffect(() => {
    if (!runtimeRunId) return
    return subscribeToRun(
      runtimeRunId,
      applyRuntime,
      () => setRuntimeError('Live updates are reconnecting'),
    )
  }, [applyRuntime, runtimeRunId])

  useEffect(() => {
    if (apiConnected || !autopilot) return
    const timer = setInterval(() => {
      const event = scriptedEvents[eventIndex.current]
      if (!event) {
        clearInterval(timer)
        return
      }
      eventIndex.current += 1

      if (event.kind === 'activity') {
        setActivity((current) =>
          [{ id: activityId.current++, time: nowLabel(), text: event.text }, ...current].slice(0, 8),
        )
      } else if (event.kind === 'advance') {
        setLeads((current) =>
          current.map((lead) =>
            lead.id === event.leadId
              ? { ...lead, status: event.status, lastAction: event.lastAction }
              : lead,
          ),
        )
      } else {
        setLeads((current) =>
          current.some((lead) => lead.id === event.lead.id)
            ? current
            : [...current, event.lead],
        )
        setLeadAutonomyMap((current) =>
          current[event.lead.id] !== undefined
            ? current
            : { ...current, [event.lead.id]: true },
        )
        setThreads((current) =>
          current[event.lead.id]
            ? current
            : { ...current, [event.lead.id]: makeThread(event.lead) },
        )
      }
    }, 3500)

    return () => clearInterval(timer)
  }, [apiConnected, autopilot])

  useEffect(() => {
    return () => {
      replyTimers.current.forEach(clearTimeout)
    }
  }, [])

  const sendLeadMessage = useCallback((id: string, body: string) => {
    const trimmed = body.trim()
    if (!trimmed) return

    const outboundId = `${id}-manual-${++msgSeq.current}`
    setThreads((current) => ({
      ...current,
      [id]: [
        ...(current[id] ?? []),
        {
          id: outboundId,
          from: `You · ${factory.name}`,
          role: 'quay',
          time: 'Just now',
          body: trimmed,
        },
      ],
    }))

    pendingReplies.current[id] = (pendingReplies.current[id] ?? 0) + 1
    setLeadTyping((current) => ({ ...current, [id]: true }))

    const timer = setTimeout(() => {
      const lead = leadsRef.current.find((item) => item.id === id)
      const reply: ThreadMessage = {
        id: `${id}-reply-${++msgSeq.current}`,
        from: lead ? `${lead.buyer} · ${shortCompany(lead.company)}` : 'Buyer',
        role: 'buyer',
        time: 'Just now',
        body: lead ? cannedBuyerReply(lead) : 'Thanks, we will review and reply shortly.',
      }
      setThreads((current) => ({
        ...current,
        [id]: [...(current[id] ?? []), reply],
      }))
      pendingReplies.current[id] = Math.max(0, (pendingReplies.current[id] ?? 1) - 1)
      if ((pendingReplies.current[id] ?? 0) === 0) {
        setLeadTyping((current) => ({ ...current, [id]: false }))
      }
    }, 2500)
    replyTimers.current.push(timer)
  }, [])

  const sendMessage = useCallback(
    (body: string) => {
      sendLeadMessage('nordlicht', body)
    },
    [sendLeadMessage],
  )

  const setLeadAutonomy = useCallback((id: string, value: boolean) => {
    setLeadAutonomyMap((current) => ({ ...current, [id]: value }))
  }, [])

  const DISCOVERY_BATCH = 3

  const startDiscovery = useCallback(() => {
    const existing = new Set(leadsRef.current.map((lead) => lead.id))
    const next = discoveryLeads.filter((lead) => !existing.has(lead.id)).slice(0, DISCOVERY_BATCH)
    if (next.length === 0) return 0

    setLeads((current) => [...current, ...next])
    setLeadAutonomyMap((current) => ({
      ...current,
      ...Object.fromEntries(next.map((lead) => [lead.id, true])),
    }))
    setThreads((current) => ({
      ...current,
      ...Object.fromEntries(next.map((lead) => [lead.id, [] as ThreadMessage[]])),
    }))
    setActivity((current) =>
      [
        {
          id: activityId.current++,
          time: nowLabel(),
          text: `${next.length} new buyers added to pipeline`,
        },
        ...current,
      ].slice(0, 8),
    )
    return next.length
  }, [])

  const ensureLeadEmail = useCallback(async (lead: Lead) => {
    const existing = threadsRef.current[lead.id] ?? []
    const hasCleanDraft = existing.some((message) => (
      message.source === 'llm'
      && !/\[(?:your\s+)?name\]|your name/i.test(message.body)
    ))
    if (hasCleanDraft) return
    if (draftingRef.current.has(lead.id)) return
    draftingRef.current.add(lead.id)
    try {
      const draft = await draftOutreachRequest({
        company: lead.company,
        country: lead.country,
        description: lead.focus,
        buyer: lead.buyer,
        focus: lead.focus,
      })
      setThreads((current) => ({
        ...current,
        [lead.id]: [{
          id: `llm-${lead.id}-m1`,
          from: 'Lead Factory',
          role: 'quay',
          time: 'Just now',
          body: draft.body,
          subject: draft.subject,
          toName: draft.contactName,
          toEmail: draft.contactEmail,
          source: 'llm',
        }],
      }))
    } finally {
      draftingRef.current.delete(lead.id)
    }
  }, [])

  const searchBuyers = useCallback(async (input: { query?: string; region?: string; buyerType?: string; maxResults?: number } = {}) => {
    const result = await searchBuyersRequest(input)
    setActivity((current) =>
      [
        {
          id: activityId.current++,
          time: nowLabel(),
          text: `Apollo found ${result.companies.length} research-only companies`,
        },
        ...current,
      ].slice(0, 8),
    )
    setDiscoveryRound((current) => ({
      round: (current?.round ?? 0) + 1,
      region: input.region ?? current?.region ?? 'Europe',
      buyerType: input.buyerType ?? current?.buyerType ?? 'importer',
      query: result.query,
      companies: result.companies,
      added: result.added,
      persisted: result.persisted,
    }))
    return result
  }, [])

  const addToPipeline = useCallback((company: BuyerSearchCompany) => {
    const exists = leadsRef.current.some(
      (lead) => lead.id === company.externalCompanyId
        || lead.company.toLowerCase() === company.name.toLowerCase(),
    )
    if (exists) return
    const webHost = company.website?.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '')
    const place = company.country ?? webHost ?? 'Web lead'
    const lead: Lead = {
      id: company.externalCompanyId,
      company: company.name,
      city: place,
      country: place,
      countryCode: countryCode(company.country ?? ''),
      buyer: 'Research only',
      title: 'Research candidate',
      focus: company.description ?? 'Furniture importing',
      status: 'sourcing',
      worker: 'Research only',
      lastAction: 'Added from Discovery',
      containers: 'n/a',
    }
    setLeads((current) => [...current, lead])
    setLeadAutonomyMap((current) => ({ ...current, [lead.id]: true }))
    setThreads((current) => ({ ...current, [lead.id]: [] }))
    setActivity((current) =>
      [
        {
          id: activityId.current++,
          time: nowLabel(),
          text: `${company.name} added to pipeline`,
        },
        ...current,
      ].slice(0, 8),
    )
  }, [])

  const discoveryRemaining = apiConnected
    ? 0
    : discoveryLeads.filter((lead) => !leads.some((item) => item.id === lead.id)).length

  const loginOwner = useCallback(async (email: string, password: string) => {
    await loginOwnerRequest(email, password)
    setRuntimeError(null)
    const snapshot = await getActiveRun()
    if (snapshot) applyRuntime(snapshot)
  }, [applyRuntime])

  const activatePilot = useCallback(async () => {
    if (!runtimeRun) throw new Error('No active run')
    const checkoutUrl = await activatePilotRequest(runtimeRun.id)
    window.location.assign(checkoutUrl)
  }, [runtimeRun])

  const decideCampaign = useCallback(async (decision: 'APPROVE' | 'REJECT') => {
    if (!runtimeRun) throw new Error('No active run')
    applyRuntime(await decideCampaignRequest(runtimeRun.id, decision))
  }, [applyRuntime, runtimeRun])

  const thread = threads.nordlicht ?? []
  const buyerTyping = Boolean(leadTyping.nordlicht)

  return (
    <DemoContext.Provider
      value={{
        leads,
        activity,
        autopilot,
        setAutopilot,
        accessLevel,
        setAccessLevel,
        thread,
        sendMessage,
        buyerTyping,
        leadAutonomy,
        setLeadAutonomy,
        threads,
        sendLeadMessage,
        leadTyping,
        startDiscovery,
        searchBuyers,
        discoveryRound,
        addToPipeline,
        ensureLeadEmail,
        discoveryRemaining,
        runtimeRun,
        apiConnected,
        runtimeError,
        loginOwner,
        activatePilot,
        decideCampaign,
      }}
    >
      {children}
    </DemoContext.Provider>
  )
}

export function useDemo() {
  const context = useContext(DemoContext)
  if (!context) throw new Error('useDemo must be used inside DemoProvider')
  return context
}

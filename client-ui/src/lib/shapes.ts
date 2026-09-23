import type { AgentReach, Credits, LogFilterValues, Summary } from './types'

/**
 * Empty shapes for resources that pages read fields off directly.
 *
 * Not sample data and never rendered as fact: every figure is null and every
 * list empty, so a page reads `—` and an empty chart while it loads, and the
 * same after a failure — where the error banner explains why. The shape exists
 * only so a component can reach for `summary.channelSplit` without guarding
 * every access.
 */
export const EMPTY_SUMMARY: Summary = {
  totalConversations: null,
  phoneConversations: null,
  whatsappConversations: null,
  webConversations: null,
  totalAgents: null,
  activeAgents: null,
  pausedAgents: null,
  resolutionRate: null,
  analytics: null,
  channelSplit: [],
  volumeSeries: [],
}

export const EMPTY_CREDITS: Credits = { balance: null, low: false, out: false }

export const EMPTY_REACH: AgentReach = { channels: [], senders: [] }

/**
 * The conversation log, unfiltered.
 *
 * Also what "Clear" assigns, which is why it lives beside the shape rather
 * than being spelled out at each call site: a default that is written twice is
 * a default that disagrees with itself eventually.
 */
export const NO_FILTERS: LogFilterValues = {
  q: '',
  status: 'All',
  channel: 'All',
  originator: 'All',
  followUp: false,
  from: '',
  to: '',
}

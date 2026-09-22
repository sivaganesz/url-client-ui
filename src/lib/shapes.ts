import type { AgentReach, Credits, Summary } from './types'

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

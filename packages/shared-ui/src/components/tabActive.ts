import { createContext, useContext } from 'react'

/**
 * Whether the enclosing tab panel is the visible one. TabManager keeps every
 * tab mounted (hidden with clip-path), so window/document key and paste
 * handlers inside a tab must bail out when it isn't active — otherwise a hidden
 * handwriting note swallows Space / Cmd+Z, a hidden mind map adds nodes on Tab.
 * Defaults to true outside TabManager (mobile, embeds).
 */
export const TabActiveContext = createContext(true)

export function useIsActiveTab(): boolean {
  return useContext(TabActiveContext)
}

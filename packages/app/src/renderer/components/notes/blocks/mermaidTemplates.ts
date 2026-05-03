export const FLOWCHART_TEMPLATE = `flowchart TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action]
    B -->|No| D[End]`

export const SEQUENCE_TEMPLATE = `sequenceDiagram
    Alice->>Bob: Hello
    Bob-->>Alice: Hi`

export const GANTT_TEMPLATE = `gantt
    title Project Plan
    section Phase 1
    Task A :a1, 2024-01-01, 30d
    Task B :after a1, 20d`

export interface MermaidTemplate {
  label: string
  code: string
}

export const MERMAID_TEMPLATES: MermaidTemplate[] = [
  { label: 'Flowchart', code: FLOWCHART_TEMPLATE },
  { label: 'Sequence', code: SEQUENCE_TEMPLATE },
  { label: 'Gantt', code: GANTT_TEMPLATE },
]

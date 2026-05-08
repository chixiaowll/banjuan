export const FLOWCHART_TEMPLATE = `flowchart TD
    A([Start]) --> B{Decision?}
    B -->|Yes| C[Process A]
    B -->|No| D[Process B]
    C --> E[/Output/]
    D --> E
    E --> F([End])`

export const SEQUENCE_TEMPLATE = `sequenceDiagram
    participant C as Client
    participant S as Server
    participant DB as Database
    C->>+S: Request
    S->>+DB: Query
    DB-->>-S: Result
    S-->>-C: Response`

export const GANTT_TEMPLATE = `gantt
    title Project Timeline
    dateFormat YYYY-MM-DD
    section Design
        Research       :a1, 2024-01-01, 10d
        Prototype      :a2, after a1, 7d
    section Development
        Frontend       :b1, after a2, 14d
        Backend        :b2, after a2, 14d
    section Testing
        QA             :c1, after b1, 7d`

export const STATE_TEMPLATE = `stateDiagram-v2
    [*] --> Idle
    Idle --> Loading: fetch
    Loading --> Success: resolve
    Loading --> Error: reject
    Success --> Idle: reset
    Error --> Loading: retry
    Error --> Idle: dismiss`

export const CLASS_TEMPLATE = `classDiagram
    class Animal {
        +String name
        +int age
        +makeSound() void
    }
    class Dog {
        +fetch() void
    }
    class Cat {
        +purr() void
    }
    Animal <|-- Dog
    Animal <|-- Cat`

export const ER_TEMPLATE = `erDiagram
    USER ||--o{ ORDER : places
    ORDER ||--|{ LINE_ITEM : contains
    PRODUCT ||--o{ LINE_ITEM : "ordered in"
    USER {
        string name
        string email
    }
    ORDER {
        int id
        date created
    }
    PRODUCT {
        string name
        float price
    }`

export const PIE_TEMPLATE = `pie title Browser Market Share
    "Chrome" : 65
    "Safari" : 19
    "Firefox" : 4
    "Edge" : 4
    "Other" : 8`

export const MINDMAP_TEMPLATE = `mindmap
    root((Project))
        Goals
            Performance
            Reliability
        Team
            Frontend
            Backend
        Timeline
            Q1
            Q2`

export interface MermaidTemplate {
  label: string
  icon: string
  code: string
}

export const MERMAID_TEMPLATES: MermaidTemplate[] = [
  { label: 'Flowchart', icon: '🔀', code: FLOWCHART_TEMPLATE },
  { label: 'Sequence', icon: '🔄', code: SEQUENCE_TEMPLATE },
  { label: 'Gantt', icon: '📅', code: GANTT_TEMPLATE },
  { label: 'State', icon: '🔁', code: STATE_TEMPLATE },
  { label: 'Class', icon: '🏗', code: CLASS_TEMPLATE },
  { label: 'ER Diagram', icon: '🗃', code: ER_TEMPLATE },
  { label: 'Pie Chart', icon: '📊', code: PIE_TEMPLATE },
  { label: 'Mindmap', icon: '🧠', code: MINDMAP_TEMPLATE },
]

export type MermaidTheme = 'default' | 'dark' | 'forest' | 'neutral'

export const MERMAID_THEMES: { label: string; value: MermaidTheme }[] = [
  { label: 'Default', value: 'default' },
  { label: 'Dark', value: 'dark' },
  { label: 'Forest', value: 'forest' },
  { label: 'Neutral', value: 'neutral' },
]

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

export type MermaidTheme = string

export interface MermaidThemeConfig {
  label: string
  value: string
  mermaidTheme: 'default' | 'dark' | 'forest' | 'neutral' | 'base'
  themeVariables?: Record<string, string>
}

export const MERMAID_THEMES: MermaidThemeConfig[] = [
  { label: 'Neutral', value: 'neutral', mermaidTheme: 'neutral' },
  { label: 'Default', value: 'default', mermaidTheme: 'default' },
  { label: 'Forest', value: 'forest', mermaidTheme: 'forest' },
  { label: 'Dark', value: 'dark', mermaidTheme: 'dark' },
  {
    label: 'Ocean',
    value: 'ocean',
    mermaidTheme: 'base',
    themeVariables: {
      primaryColor: '#B2EBF2',
      primaryTextColor: '#004D56',
      primaryBorderColor: '#00838F',
      secondaryColor: '#E0F7FA',
      secondaryTextColor: '#00695C',
      secondaryBorderColor: '#4DD0E1',
      tertiaryColor: '#F0FDFA',
      tertiaryTextColor: '#26A69A',
      tertiaryBorderColor: '#B2DFDB',
      lineColor: '#00838F',
      textColor: '#004D56',
      mainBkg: '#B2EBF2',
      nodeBorder: '#00838F',
      clusterBkg: '#E0F7FA',
      clusterBorder: '#4DD0E1',
      titleColor: '#006064',
      edgeLabelBackground: '#E0F7FA',
      nodeTextColor: '#004D56',
    },
  },
  {
    label: 'Colorful',
    value: 'colorful',
    mermaidTheme: 'base',
    themeVariables: {
      primaryColor: '#FFE0E0',
      primaryTextColor: '#C62828',
      primaryBorderColor: '#FF6B6B',
      secondaryColor: '#FFF3E0',
      secondaryTextColor: '#E65100',
      secondaryBorderColor: '#FFA94D',
      tertiaryColor: '#FFFDE7',
      tertiaryTextColor: '#F57F17',
      tertiaryBorderColor: '#FFD43B',
      lineColor: '#FF6B6B',
      textColor: '#333333',
      mainBkg: '#FFE0E0',
      nodeBorder: '#FF6B6B',
      clusterBkg: '#FFF3E0',
      clusterBorder: '#FFA94D',
      titleColor: '#C62828',
      edgeLabelBackground: '#FFFDE7',
      nodeTextColor: '#333333',
    },
  },
  {
    label: 'Business',
    value: 'business',
    mermaidTheme: 'base',
    themeVariables: {
      primaryColor: '#ECF0F1',
      primaryTextColor: '#2C3E50',
      primaryBorderColor: '#2C3E50',
      secondaryColor: '#F8F9FA',
      secondaryTextColor: '#495057',
      secondaryBorderColor: '#BDC3C7',
      tertiaryColor: '#FFFFFF',
      tertiaryTextColor: '#6C757D',
      tertiaryBorderColor: '#DEE2E6',
      lineColor: '#2C3E50',
      textColor: '#2C3E50',
      mainBkg: '#ECF0F1',
      nodeBorder: '#2C3E50',
      clusterBkg: '#F8F9FA',
      clusterBorder: '#BDC3C7',
      titleColor: '#1A252F',
      edgeLabelBackground: '#ECF0F1',
      nodeTextColor: '#2C3E50',
    },
  },
  {
    label: 'Organic',
    value: 'organic',
    mermaidTheme: 'base',
    themeVariables: {
      primaryColor: '#FDEBD0',
      primaryTextColor: '#6E3B00',
      primaryBorderColor: '#D35400',
      secondaryColor: '#FEF5E7',
      secondaryTextColor: '#7B4F1E',
      secondaryBorderColor: '#F5CBA7',
      tertiaryColor: '#FFFAF4',
      tertiaryTextColor: '#8B6F50',
      tertiaryBorderColor: '#F5E6D3',
      lineColor: '#D35400',
      textColor: '#6E3B00',
      mainBkg: '#FDEBD0',
      nodeBorder: '#D35400',
      clusterBkg: '#FEF5E7',
      clusterBorder: '#F5CBA7',
      titleColor: '#BA4A00',
      edgeLabelBackground: '#FEF5E7',
      nodeTextColor: '#6E3B00',
    },
  },
  {
    label: 'Technology',
    value: 'technology',
    mermaidTheme: 'base',
    themeVariables: {
      primaryColor: '#263D50',
      primaryTextColor: '#E0E0E0',
      primaryBorderColor: '#4CAF50',
      secondaryColor: '#1E3244',
      secondaryTextColor: '#B0BEC5',
      secondaryBorderColor: '#37474F',
      tertiaryColor: '#1B2A3A',
      tertiaryTextColor: '#90A4AE',
      tertiaryBorderColor: '#37474F',
      lineColor: '#4CAF50',
      textColor: '#E0E0E0',
      mainBkg: '#263D50',
      nodeBorder: '#4CAF50',
      clusterBkg: '#1E3244',
      clusterBorder: '#4CAF50',
      titleColor: '#4CAF50',
      edgeLabelBackground: '#1E3244',
      nodeTextColor: '#E0E0E0',
    },
  },
  {
    label: 'Steady',
    value: 'steady',
    mermaidTheme: 'base',
    themeVariables: {
      primaryColor: '#E3F2FD',
      primaryTextColor: '#1565C0',
      primaryBorderColor: '#1565C0',
      secondaryColor: '#BBDEFB',
      secondaryTextColor: '#1976D2',
      secondaryBorderColor: '#42A5F5',
      tertiaryColor: '#F5F5F5',
      tertiaryTextColor: '#1565C0',
      tertiaryBorderColor: '#90CAF9',
      lineColor: '#1565C0',
      textColor: '#1565C0',
      mainBkg: '#E3F2FD',
      nodeBorder: '#1565C0',
      clusterBkg: '#BBDEFB',
      clusterBorder: '#42A5F5',
      titleColor: '#0D47A1',
      edgeLabelBackground: '#E3F2FD',
      nodeTextColor: '#1565C0',
    },
  },
  {
    label: 'Snowbrush',
    value: 'snowbrush',
    mermaidTheme: 'base',
    themeVariables: {
      primaryColor: '#FFFFFF',
      primaryTextColor: '#1565C0',
      primaryBorderColor: '#1565C0',
      secondaryColor: '#FFFFFF',
      secondaryTextColor: '#E53935',
      secondaryBorderColor: '#E53935',
      tertiaryColor: '#FAFAFA',
      tertiaryTextColor: '#616161',
      tertiaryBorderColor: '#BDBDBD',
      lineColor: '#424242',
      textColor: '#333333',
      mainBkg: '#FFFFFF',
      nodeBorder: '#1565C0',
      clusterBkg: '#FAFAFA',
      clusterBorder: '#E53935',
      titleColor: '#E53935',
      edgeLabelBackground: '#FFFFFF',
      nodeTextColor: '#333333',
    },
  },
]

export function getMermaidThemeConfig(value: string): MermaidThemeConfig {
  return MERMAID_THEMES.find(t => t.value === value) ?? MERMAID_THEMES[0]
}

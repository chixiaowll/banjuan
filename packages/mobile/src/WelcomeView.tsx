import { useState } from 'react'
import { Button, Stack, Text, Container } from '@mantine/core'
import { useBanjuanAPI } from '@banjuan/shared-ui'

interface Props {
  onOpen: (path: string, name: string) => void
}

export function WelcomeView({ onOpen }: Props) {
  const api = useBanjuanAPI()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleOpen = async () => {
    setLoading(true)
    setError(null)
    try {
      const path = 'BanjuanLibrary'
      const name = 'My Library'
      const exists = await api.library.check(path)
      if (exists) {
        await api.library.open(path)
      } else {
        await api.library.init(path, name)
      }
      onOpen(path, name)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('Failed to open library:', msg, err)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Container size="sm" style={{ paddingTop: 80, paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <Stack align="center" gap="lg">
        <Text size="xl" fw={700}>Banjuan</Text>
        <Text c="dimmed">Knowledge Management</Text>
        {error && <Text c="red" size="sm" style={{ wordBreak: 'break-all' }}>{error}</Text>}
        <Button size="lg" onClick={handleOpen} loading={loading}>
          Open Library
        </Button>
      </Stack>
    </Container>
  )
}

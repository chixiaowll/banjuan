import { useState } from 'react'
import { Button, Stack, Text, Container } from '@mantine/core'
import { useBanjuanAPI } from '@banjuan/shared-ui'

interface Props {
  onOpen: () => void
}

export function WelcomeView({ onOpen }: Props) {
  const api = useBanjuanAPI()
  const [loading, setLoading] = useState(false)

  const handleOpen = async () => {
    setLoading(true)
    try {
      const path = 'BanjuanLibrary'
      const exists = await api.library.check(path)
      if (exists) {
        await api.library.open(path)
      } else {
        await api.library.init(path, 'My Library')
      }
      onOpen()
    } catch (err) {
      console.error('Failed to open library:', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Container size="sm" style={{ paddingTop: 80, paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <Stack align="center" gap="lg">
        <Text size="xl" fw={700}>Banjuan</Text>
        <Text c="dimmed">Knowledge Management</Text>
        <Button size="lg" onClick={handleOpen} loading={loading}>
          Open Library
        </Button>
      </Stack>
    </Container>
  )
}

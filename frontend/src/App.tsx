import { useEffect, useRef, useState } from 'react'
import './App.css'

type PipeResponse = {
  english: string
  spanish: string
  audio?: { mime: string; base64: string }
} | { error: string }

function App() {
  const [recording, setRecording] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [spanish, setSpanish] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autoSend, setAutoSend] = useState(true)
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null)
  const lastBlobRef = useRef<Blob | null>(null)
  const [ttsUrl, setTtsUrl] = useState<string | null>(null)
  const [ttsMime, setTtsMime] = useState<string | null>(null)
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null)
  const [recordedSize, setRecordedSize] = useState<number | null>(null)
  const preferredMimeRef = useRef<string | null>(null)
  const [chosenMime, setChosenMime] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])

  useEffect(() => {
    return () => {
      // cleanup recorder if component unmounts
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop()
      }
    }
  }, [])

  const startRecording = async () => {
    setError(null)
    setTranscript('')
    setSpanish('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      // negotiate a working mimeType for MediaRecorder across browsers
      const candidates = [
        preferredMimeRef.current,
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/ogg',
        'audio/wav'
      ].filter(Boolean) as string[]

      let mr: MediaRecorder | null = null
      let selected: string | null = null
      for (const m of candidates) {
        try {
          mr = new MediaRecorder(stream, { mimeType: m })
          selected = m
          break
        } catch (e) {
          console.warn('MediaRecorder init failed for', m, e)
        }
      }
      if (!mr) {
        try {
          // try without options
          mr = new MediaRecorder(stream)
          const maybe = mr as unknown as { mimeType?: string }
          selected = maybe.mimeType || null
        } catch (e) {
          const msg = String(e)
          setError('Failed to start recording: ' + msg)
          console.error('MediaRecorder failed to start', e)
          return
        }
      }
      preferredMimeRef.current = selected
      setChosenMime(selected)

      chunksRef.current = []
      mr.ondataavailable = (e) => {
        // debug: log chunk info
        console.log('ondataavailable', { size: e.data?.size, type: e.data?.type, chunkCount: chunksRef.current.length })
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data)
          console.log('Added chunk to array, total chunks:', chunksRef.current.length)
        } else {
          console.warn('Empty or null chunk received')
        }
      }
      mr.onstop = async () => {
        console.log('onstop triggered, chunks collected:', chunksRef.current.length)
        const blob = new Blob(chunksRef.current, { type: mr.mimeType })
        // debug: final blob info
        console.log('onstop final blob', { size: blob.size, type: blob.type, mimeUsed: mr.mimeType, totalChunks: chunksRef.current.length })
        setRecordedSize(blob.size)

        // store for preview/download
        try {
          if (recordedUrl) {
            URL.revokeObjectURL(recordedUrl)
          }
        } catch (e: unknown) {
          // ignore revoke errors but log for visibility
          console.warn('revokeObjectURL failed', String(e))
        }
        const url = URL.createObjectURL(blob)
        lastBlobRef.current = blob
        setRecordedUrl(url)
        
        // optionally auto-send to server
        if (autoSend) await sendForTranscription(blob)

        // stop tracks
        stream.getTracks().forEach((t) => t.stop())
      }
      mediaRecorderRef.current = mr
      // start with timeslice to force chunk generation every 100ms
      mr.start(100)
      console.log('MediaRecorder started with 100ms timeslice')
      setRecording(true)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Mic permission denied or unsupported'
      setError(msg)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      setRecording(false)
      mediaRecorderRef.current.stop()
    }
  }

  const sendForTranscription = async (blob: Blob) => {
    setLoading(true)
    setError(null)
    try {
      const form = new FormData()
      // name the file with extension matching type if possible
      const ext = blob.type.includes('webm') ? 'webm' : blob.type.includes('wav') ? 'wav' : 'webm'
      form.append('audio', blob, `recording.${ext}`)

      const res = await fetch('/api/transcribe', {
        method: 'POST',
        body: form,
      })

      const data: PipeResponse = await res.json()
      if (!res.ok) throw new Error(('error' in data && data.error) || 'Request failed')

      if ('english' in data) setTranscript(data.english)
      if ('spanish' in data) setSpanish(data.spanish)

      // decode and play TTS audio if provided
      if ('audio' in data && data.audio?.base64) {
        try {
          const { base64, mime } = data.audio as { base64: string; mime: string }
          const binary = atob(base64)
          const len = binary.length
          const bytes = new Uint8Array(len)
          for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i)
          const ttsBlob = new Blob([bytes], { type: mime })
          const url = URL.createObjectURL(ttsBlob)
          if (ttsUrl) URL.revokeObjectURL(ttsUrl)
          setTtsUrl(url)
          setTtsMime(mime)
          // attempt autoplay (may be blocked by browser)
          setTimeout(() => ttsAudioRef.current?.play().catch(() => {}), 50)
        } catch (e) {
          console.warn('Failed to decode TTS audio', e)
        }
      } else {
        if (ttsUrl) {
          URL.revokeObjectURL(ttsUrl)
          setTtsUrl(null)
          setTtsMime(null)
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to transcribe/translate'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 720, border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, boxShadow: '0 6px 24px rgba(0,0,0,0.06)' }}>
        <h2 style={{ margin: 0, marginBottom: 12 }}>Speech to Text + Spanish Translation</h2>
        <p style={{ color: '#6b7280', marginTop: 0, marginBottom: 16 }}>Record your voice in English. On stop, we transcribe and translate to Spanish.</p>

        <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
          {!recording ? (
            <button onClick={startRecording} disabled={loading} style={{ padding: '10px 16px', borderRadius: 8, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer' }}>
              {loading ? 'Processing…' : 'Start Recording'}
            </button>
          ) : (
            <button onClick={stopRecording} style={{ padding: '10px 16px', borderRadius: 8, background: '#dc2626', color: '#fff', border: 'none', cursor: 'pointer' }}>
              Stop Recording
            </button>
          )}
          {recording && <span style={{ color: '#dc2626' }}>● Recording…</span>}
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
            <input type="checkbox" checked={autoSend} onChange={(e) => setAutoSend(e.target.checked)} />
            <span>Auto-send on stop</span>
          </label>
        </div>

        {chosenMime && <div style={{ color: '#6b7280', fontSize: 13, marginBottom: 12 }}>Chosen mime: {chosenMime}</div>}

        {recordedUrl && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>Preview Recording</label>
            <audio src={recordedUrl} controls style={{ width: '100%', marginBottom: 8 }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={async () => {
                  if (lastBlobRef.current) await sendForTranscription(lastBlobRef.current)
                }}
                disabled={loading}
                style={{ padding: '8px 12px', borderRadius: 8, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer' }}
              >
                Send Recording
              </button>
              <a
                href={recordedUrl}
                download={`recording.${lastBlobRef.current?.type.includes('webm') ? 'webm' : lastBlobRef.current?.type.includes('wav') ? 'wav' : 'webm'}`}
                style={{ padding: '8px 12px', borderRadius: 8, background: '#6b7280', color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
              >
                Download
              </a>
            </div>
          </div>
        )}

        {ttsUrl && (
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>TTS Audio</label>
            <audio ref={ttsAudioRef} src={ttsUrl} controls style={{ width: '100%', marginBottom: 8 }} />
            <a
              href={ttsUrl}
              download={`tts.${ttsMime?.split('/')[1] || 'wav'}`}
              style={{ padding: '8px 12px', borderRadius: 8, background: '#6b7280', color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
            >
              Download TTS Audio
            </a>
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
          {recordedSize !== null && <div style={{ color: '#6b7280', fontSize: 13 }}>Recorded size: {recordedSize} bytes</div>}
          <button
            onClick={async () => {
              // force webm and restart recording to test alternative mime
              preferredMimeRef.current = 'audio/webm;codecs=opus'
              // restart flow
              if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
                mediaRecorderRef.current.stop()
              }
              await startRecording()
            }}
            style={{ padding: '8px 12px', borderRadius: 8, background: '#f59e0b', color: '#fff', border: 'none', cursor: 'pointer' }}
          >
            Retry with webm
          </button>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', color: '#991b1b', padding: 10, borderRadius: 8, marginBottom: 12 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>Transcribed Text (English)</label>
            <textarea
              value={transcript}
              readOnly
              placeholder="Transcribed text will appear here"
              style={{ width: '100%', minHeight: 160, padding: 10, borderRadius: 8, border: '1px solid #e5e7eb', resize: 'vertical' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 8 }}>Translated (Spanish)</label>
            <textarea
              value={spanish}
              readOnly
              placeholder="Spanish translation will appear here"
              style={{ width: '100%', minHeight: 160, padding: 10, borderRadius: 8, border: '1px solid #e5e7eb', resize: 'vertical' }}
            />
          </div>
        </div>

        {recordedSize !== null && (
          <div style={{ marginTop: 12, fontSize: 14, color: '#374151' }}>
            Recorded size: {Math.round(recordedSize / 1024)} KB
          </div>
        )}

        <div style={{ marginTop: 12, fontSize: 12, color: '#6b7280' }}>
          Uses the browser MediaRecorder API. Audio is sent to /api/transcribe when you stop.
        </div>
      </div>
    </div>
  )
}

export default App

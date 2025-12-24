{{- define "solana-streamer.name" -}}
solana-streamer
{{- end }}

{{- define "solana-streamer.fullname" -}}
{{ include "solana-streamer.name" . }}
{{- end }}

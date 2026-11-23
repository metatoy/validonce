{{/*
SPDX-License-Identifier: Apache-2.0
Copyright 2026 Metatoy LLC
*/}}

{{- define "validonce-demo.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "validonce-demo.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "validonce-demo.apiName" -}}
{{- printf "%s-api" (include "validonce-demo.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "validonce-demo.webName" -}}
{{- printf "%s-web" (include "validonce-demo.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "validonce-demo.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "validonce-demo.labels" -}}
helm.sh/chart: {{ include "validonce-demo.chart" . }}
{{ include "validonce-demo.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "validonce-demo.selectorLabels" -}}
app.kubernetes.io/name: {{ include "validonce-demo.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "validonce-demo.image" -}}
{{- printf "%s:%s" .repository (toString .tag) }}
{{- end }}

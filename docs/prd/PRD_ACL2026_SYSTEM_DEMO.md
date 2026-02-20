# PRD: ACL 2026 System Demonstration Paper

## Meta

| Item | Detail |
|------|--------|
| **Target** | ACL 2026 System Demonstration Track |
| **Deadline** | 2026-02-27 (금) 11:59 PM UTC-12 (D-7) |
| **Conference** | July 2-7, 2026 / San Diego, CA |
| **Notification** | April 24, 2026 |
| **Camera-ready** | May 15, 2026 |
| **Format** | 6 pages + unlimited refs + 2-page appendix |
| **Video** | 2.5분 이내 screencast (필수) |
| **Live Demo** | URL 또는 installable package 필수 (없으면 desk reject) |
| **Review** | Single-blind (저자 공개 가능) |
| **Preference** | Open-source / Open-access 우대 |

---

## 1. Paper Title (Working)

**WIGVO: A Real-Time Bidirectional Speech Translation System for PSTN Telephone Calls**

Alternative:
- *WIGVO: Bridging Language Barriers over Phone Lines with Real-Time AI Translation*
- *Real-Time Bidirectional Speech Translation over PSTN: System Design and Empirical Optimization*

---

## 2. Research Contribution (Why This Paper Matters)

### 2.1 Problem Statement

기존 실시간 번역 시스템(Google Translate, Microsoft Translator)은 **VoIP/WebRTC** 환경에 최적화되어 있다.
그러나 실제 전화 통화(PSTN)는 여전히 전 세계 통신의 대부분을 차지하며, 다음과 같은 고유 문제가 존재한다:

| Challenge | VoIP/WebRTC | PSTN (Our Domain) |
|-----------|-------------|-------------------|
| Audio Codec | PCM16/Opus (16-48kHz) | G.711 mu-law (8kHz) |
| Echo Pattern | AEC 하드웨어 처리 | 네트워크 에코 + 하이브리드 변환기 에코 |
| Latency | ~50ms | ~200-400ms (PSTN round-trip) |
| Audio Quality | High SNR | Low SNR, DTMF tones, comfort noise |
| VAD Accuracy | Well-studied | Under-explored (no prior work on optimal params) |

### 2.2 Our Contributions

1. **System Architecture**: OpenAI Realtime API + Twilio Media Streams 기반 최초의 양방향 PSTN 실시간 번역 시스템
2. **Echo Prevention**: PSTN 환경에 특화된 Echo Gate + Silence Injection + Dynamic Cooldown 메커니즘
3. **Empirical Parameter Optimization**: G.711 mu-law 환경에서의 VAD 파라미터 (RMS threshold, Silero probability, silence/speech frames) 최적값 탐색 — **기존 연구 부재 영역**
4. **Multi-Pipeline Architecture**: 4가지 통신 모드(V2V, V2T, T2V, Full Agent) 전환 가능한 Strategy Pattern 파이프라인

### 2.3 Novelty Positioning

```
┌─────────────────────────────────────────────────────────────┐
│  Prior Work                                                  │
│  ────────                                                    │
│  • Google Translate: VoIP duplex, no PSTN support            │
│  • SeamlessM4T (Meta): Offline model, not real-time PSTN     │
│  • Whisper + TTS pipelines: High latency (>3s), half-duplex  │
│  • OpenAI Realtime API: Designed for direct WS, not PSTN     │
│                                                              │
│  Our System                                                   │
│  ──────────                                                   │
│  • First bidirectional real-time translation over PSTN        │
│  • Empirical VAD optimization for G.711 mu-law               │
│  • Echo prevention without AEC hardware                       │
│  • Sub-2s end-to-end translation latency                     │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. System Architecture (Paper Section 2)

### 3.1 Architecture Diagram (논문용)

```
┌──────────────┐                    ┌─────────────────────┐
│   User App   │◄──── PCM16 ──────►│                     │
│  (Web/Mobile) │    16kHz WS       │                     │
└──────────────┘                    │                     │
                                    │   WIGVO Relay       │
┌──────────────┐                    │   Server            │
│   Recipient  │◄── G.711 µ-law ──►│   (FastAPI)         │
│   (PSTN)     │    8kHz Twilio     │                     │
└──────────────┘                    │  ┌───────────────┐  │
                                    │  │ Session A      │  │
                                    │  │ (User→Recip)  │──┼──► OpenAI
                                    │  └───────────────┘  │    Realtime
                                    │  ┌───────────────┐  │    API
                                    │  │ Session B      │  │
                                    │  │ (Recip→User)  │──┼──► (WS)
                                    │  └───────────────┘  │
                                    │  ┌───────────────┐  │
                                    │  │ Echo Gate     │  │
                                    │  │ + Local VAD   │  │
                                    │  │ + Pipeline    │  │
                                    │  └───────────────┘  │
                                    └─────────────────────┘
```

### 3.2 Dual Session Design

| Session | Direction | Input | Output | VAD |
|---------|-----------|-------|--------|-----|
| A | User → Recipient | User speech (PCM16) | Translated TTS → Twilio | Client VAD / Server VAD |
| B | Recipient → User | Recipient speech (G.711) | Translated TTS → App | Local VAD (Silero+RMS) / Server VAD |

### 3.3 Pipeline Strategy Pattern

```
AudioRouter (Thin Delegator)
    ├── VoiceToVoicePipeline    ← 양방향 음성 번역
    ├── TextToVoicePipeline     ← 텍스트 → TTS
    └── FullAgentPipeline       ← AI 자율 대화
```

---

## 4. Empirical Study: VAD Parameter Optimization (Paper Section 3)

### 4.1 Experiment Design

**이 섹션이 논문의 핵심 기여.**
PSTN G.711 mu-law 환경에서 VAD 파라미터 최적값을 체계적으로 탐색.

#### Independent Variables

| Variable | Range | Step | Default | Unit |
|----------|-------|------|---------|------|
| `rms_threshold` | 50, 100, **150**, 200, 300 | - | 150 | RMS amplitude |
| `speech_prob_threshold` | 0.3, 0.4, **0.5**, 0.6, 0.7 | - | 0.5 | Silero probability |
| `silence_prob_threshold` | 0.2, 0.25, 0.3, **0.35**, 0.4 | - | 0.35 | Silero probability |
| `min_silence_frames` | 5, 8, 10, **15**, 20 | - | 15 | frames (×32ms) |
| `min_speech_frames` | 1, 2, **3**, 5, 8 | - | 3 | frames (×32ms) |

**Bold** = current production value

#### Dependent Variables (Metrics)

| Metric | Definition | Unit | Source |
|--------|-----------|------|--------|
| **E2E Latency** | Recipient speech_stopped → translated audio first chunk | ms | `session_b_e2e_latencies_ms` |
| **VAD Latency** | Actual speech end → VAD speech_stopped event | ms | Local VAD timestamps |
| **False Positive Rate** | Non-speech events triggering speech_started / Total events | % | `vad_false_triggers` |
| **False Negative Rate** | Missed speech events / Total actual speech | % | Manual annotation |
| **Echo False Trigger** | TTS echo detected as speech / Total echo windows | % | `echo_loops_detected` |
| **Turn Completion Rate** | Successful translation turns / Total speech events | % | `turn_count` vs speech events |

#### Experimental Conditions

```
Experiment 1: RMS Threshold Sweep (다른 변수 고정)
  → 5 conditions × 3 scenarios × 3 repetitions = 45 calls

Experiment 2: Silero Speech Threshold Sweep
  → 5 conditions × 3 scenarios × 3 repetitions = 45 calls

Experiment 3: Silence Duration Sweep
  → 5 conditions × 3 scenarios × 3 repetitions = 45 calls

Experiment 4: Joint Optimization (상위 3개 조합)
  → 3×3×3 = 27 conditions × 3 scenarios = 81 calls

Total: ~216 calls (자동화 시 ~3시간)
```

#### Test Scenarios

| Scenario | Description | Characteristics |
|----------|-------------|-----------------|
| Restaurant | 예약 문의 (한→일) | 짧은 응답, 숫자 포함 |
| Hospital | 진료 예약 (한→영) | 전문 용어, 긴 문장 |
| Delivery | 배송 추적 (한→중) | 빠른 턴, 짧은 대화 |

### 4.2 Measurement Infrastructure

#### 현재 보유 (Already Built)

| Component | Status | Location |
|-----------|--------|----------|
| CallMetrics (latency, turns, echo) | ✅ Ready | `src/types.py:228-248` |
| LocalVAD frame-level logging | ✅ Ready | `src/realtime/local_vad.py:130` |
| Silero probability logging | ✅ Ready | `src/realtime/local_vad.py:176` |
| E2E call client | ✅ Ready | `tests/e2e/call_client.py` |
| Echo suppression counter | ✅ Ready | `src/types.py:242` |
| VAD false trigger counter | ✅ Ready | `src/types.py:246` |

#### 추가 구축 필요 (To Build)

| Component | Priority | Description |
|-----------|----------|-------------|
| **Parameter Sweep Runner** | P0 | Config override + batch execution |
| **Metrics Aggregator** | P0 | JSON log → CSV/DataFrame 변환 |
| **VAD Latency Probe** | P1 | Actual speech end timestamp 측정 |
| **Results Visualizer** | P1 | matplotlib/seaborn 차트 생성 |
| **Automated Scenario Runner** | P2 | E2E client + parameter matrix |

### 4.3 Expected Results Table (논문 Table 형식)

```
Table 1: Effect of RMS Threshold on VAD Performance (G.711 µ-law, 8kHz)

| RMS Threshold | FPR (%) | FNR (%) | Echo FT (%) | Avg Latency (ms) |
|---------------|---------|---------|-------------|-------------------|
| 50            | ?.?     | ?.?     | ?.?         | ???               |
| 100           | ?.?     | ?.?     | ?.?         | ???               |
| 150 (default) | ?.?     | ?.?     | ?.?         | ???               |
| 200           | ?.?     | ?.?     | ?.?         | ???               |
| 300           | ?.?     | ?.?     | ?.?         | ???               |

Table 2: Effect of Silero Speech Probability Threshold

| Prob Threshold | FPR (%) | FNR (%) | Avg Latency (ms) | Turn Completion (%) |
|----------------|---------|---------|-------------------|---------------------|
| 0.3            | ?.?     | ?.?     | ???               | ?.?                 |
| 0.4            | ?.?     | ?.?     | ???               | ?.?                 |
| 0.5 (default)  | ?.?     | ?.?     | ???               | ?.?                 |
| 0.6            | ?.?     | ?.?     | ???               | ?.?                 |
| 0.7            | ?.?     | ?.?     | ???               | ?.?                 |

Table 3: Optimal Configuration (Joint Optimization)

| Config      | RMS  | Speech | Silence | Frames | E2E Latency | FPR  | Echo FT |
|-------------|------|--------|---------|--------|-------------|------|---------|
| Conservative| 200  | 0.6    | 0.4     | 20     | ???ms       | ?.?% | ?.?%    |
| Balanced    | 150  | 0.5    | 0.35    | 15     | ???ms       | ?.?% | ?.?%    |
| Aggressive  | 100  | 0.4    | 0.3     | 8      | ???ms       | ?.?% | ?.?%    |
| **Optimal** | ???  | ???    | ???     | ???    | ???ms       | ?.?% | ?.?%    |
```

---

## 5. Echo Prevention Analysis (Paper Section 4)

### 5.1 Echo Sources in PSTN

```
┌─────────┐    TTS Audio    ┌─────────┐    PSTN     ┌──────────┐
│ Session A│ ──────────────► │ Twilio  │ ─────────► │Recipient │
│ (Output) │                 │ Gateway │             │  Phone   │
└─────────┘                 └────┬────┘             └────┬─────┘
                                 │                       │
                            Echo │ (electrical)     Echo │ (acoustic)
                            ~50ms│                  ~200ms│
                                 ▼                       ▼
┌─────────┐    Echo Audio   ┌─────────┐    PSTN     ┌──────────┐
│ Session B│ ◄────────────── │ Twilio  │ ◄───────── │Recipient │
│ (Input)  │                 │ Gateway │             │  Phone   │
└─────────┘                 └─────────┘             └──────────┘
```

### 5.2 Our Solution: Echo Gate + Dynamic Cooldown

| Component | Mechanism | Parameter |
|-----------|-----------|-----------|
| Echo Window | TTS 전송 시 활성화 → Twilio 입력을 µ-law silence(0xFF)로 대체 | 자동 |
| Dynamic Cooldown | `remaining_playback + 0.5s` (PSTN round-trip margin) | `echo_margin_s=0.5` |
| Silence Injection | `0xFF` bytes → VAD가 정상적으로 speech_stopped 감지 | - |
| RMS Energy Gate | Echo window 중 RMS < threshold → 무시 | `echo_energy_threshold_rms=400` |

### 5.3 Ablation Study (논문 Table)

```
Table 4: Ablation Study on Echo Prevention Components

| Configuration                    | Echo FT (%) | Missed Speech (%) | Avg Latency (ms) |
|----------------------------------|-------------|-------------------|-------------------|
| No echo prevention (baseline)    | ?.?         | 0.0               | ???               |
| Echo Gate only                   | ?.?         | ?.?               | ???               |
| Echo Gate + Silence Injection    | ?.?         | ?.?               | ???               |
| + Dynamic Cooldown               | ?.?         | ?.?               | ???               |
| + RMS Energy Gate (full system)  | ?.?         | ?.?               | ???               |
```

---

## 6. Paper Outline (6 pages)

### Page Budget

| Section | Pages | Content |
|---------|-------|---------|
| 1. Introduction | 0.75 | Problem, motivation, contributions |
| 2. System Architecture | 1.25 | Dual session, pipelines, audio flow |
| 3. VAD Optimization | 1.5 | Experiment design, results tables, analysis |
| 4. Echo Prevention | 1.0 | Mechanism, ablation study |
| 5. Demo Description | 0.75 | UI screenshots, live demo URL, usage |
| 6. Conclusion | 0.25 | Summary, future work |
| References | ∞ | ~20-30 citations |
| Appendix | 2 | Additional tables, parameter details |

### Section Details

#### Section 1: Introduction (0.75 pages)
- PSTN 환경의 실시간 번역 필요성 (외국인, 장애인, 콜포비아)
- 기존 솔루션의 한계 (VoIP 전용, 높은 지연, 반이중)
- Our contributions (3-4 bullet points)

#### Section 2: System Architecture (1.25 pages)
- Architecture diagram (Figure 1)
- Dual Session design rationale
- Pipeline Strategy Pattern (V2V, T2V, Full Agent)
- Audio processing: G.711 µ-law → Silero VAD → OpenAI Realtime

#### Section 3: Empirical VAD Optimization (1.5 pages)
- **이 섹션이 논문의 핵심 기여**
- Experiment setup (variables, scenarios, metrics)
- Table 1-3: Parameter sweep results
- Analysis: RMS vs Silero threshold 상호작용
- Optimal configuration 도출 과정
- Figure 2: Latency vs FPR trade-off curve

#### Section 4: Echo Prevention (1.0 pages)
- Echo sources in PSTN (Figure 3)
- Echo Gate + Dynamic Cooldown mechanism
- Table 4: Ablation study
- Comparison: Pearson correlation (failed) vs Echo Gate (success)

#### Section 5: Demo Description (0.75 pages)
- Web demo URL + screenshot (Figure 4)
- Usage flow: 시나리오 선택 → AI 대화 → 장소 검색 → 전화 연결
- Supported languages: Korean ↔ English/Japanese/Chinese
- Figure 5: Call monitoring UI (실시간 자막)

#### Section 6: Conclusion (0.25 pages)
- Summary of contributions
- Future work: more languages, mobile VAD, on-device inference

---

## 7. Demo Preparation

### 7.1 Live Demo System

| Item | Requirement | Status |
|------|-------------|--------|
| **Demo URL** | 공개 접근 가능한 웹 앱 | ✅ 배포됨 (Cloud Run) |
| **Relay Server** | 상시 가동 | ✅ 배포됨 (Cloud Run) |
| **Twilio Number** | 수신 전화번호 | ✅ 보유 |
| **Demo Account** | 리뷰어용 테스트 계정 | 🔲 생성 필요 |
| **Rate Limiting** | 리뷰어 사용량 제한 | 🔲 구현 필요 |
| **Demo Guide Page** | 사용법 안내 페이지 | 🔲 작성 필요 |

### 7.2 Screencast Video (2.5분)

**구성:**

| Timestamp | Content | Duration |
|-----------|---------|----------|
| 0:00-0:15 | 시스템 소개 + 문제 정의 | 15s |
| 0:15-0:45 | Web UI 시연: 시나리오 선택 → AI 대화 → 장소 검색 | 30s |
| 0:45-1:30 | 실시간 통화: 한국어 → 일본어 양방향 번역 | 45s |
| 1:30-2:00 | 통화 모니터링: 실시간 자막 + 번역 표시 | 30s |
| 2:00-2:20 | 다른 모드 시연: Text-to-Voice, Agent Mode | 20s |
| 2:20-2:30 | 아키텍처 다이어그램 + 마무리 | 10s |

---

## 8. Related Work & Citations

### Must-cite Papers

| Paper | Relevance |
|-------|-----------|
| Radford et al. (2023) — Whisper | ASR baseline |
| Barrault et al. (2023) — SeamlessM4T | Speech translation SOTA |
| Meta (2024) — Seamless Streaming | Low-latency streaming translation |
| Silero Team (2021) — Silero VAD | Our VAD backbone |
| OpenAI (2024) — GPT-4o Realtime API | Our translation engine |
| Twilio (2024) — Media Streams | PSTN integration |
| ITU-T G.711 | µ-law codec specification |
| Sohn et al. (1999) — Statistical VAD | Classical VAD baseline |
| WebRTC VAD | Comparison point (VoIP) |

### Positioning Against Related Systems

| System | Real-time | PSTN | Bidirectional | Open | Year |
|--------|-----------|------|---------------|------|------|
| Google Translate | ✅ | ❌ | ❌ | ❌ | 2024 |
| SeamlessM4T | ❌ | ❌ | ✅ | ✅ | 2023 |
| Seamless Streaming | ✅ | ❌ | ✅ | ✅ | 2024 |
| Skype Translator | ✅ | ❌ | ✅ | ❌ | 2014 |
| **WIGVO (Ours)** | **✅** | **✅** | **✅** | **✅** | **2026** |

---

## 9. Deliverables & Timeline

### D-7 → D-0 (2/20 ~ 2/27)

| Day | Date | Deliverable | Owner |
|-----|------|------------|-------|
| D-7 | 2/20 (목) | PRD 확정 + 실험 인프라 설계 | Both |
| D-6 | 2/21 (금) | Parameter Sweep Runner 구현 + Metrics Aggregator | Dev |
| D-5 | 2/22 (토) | **Experiment 1-2 실행** (RMS + Silero threshold) | Dev |
| D-4 | 2/23 (일) | **Experiment 3-4 실행** (Silence frames + Joint) + 결과 분석 | Dev |
| D-3 | 2/24 (월) | Paper Section 1-2 작성 (Intro + Architecture) | Author |
| D-2 | 2/25 (화) | Paper Section 3-4 작성 (VAD Optimization + Echo Prevention) | Author |
| D-1 | 2/26 (수) | Paper Section 5-6 + Demo video 촬영 + 교정 | Both |
| **D-0** | **2/27 (목)** | **최종 검토 + 제출** | Both |

### Deliverable Checklist

| # | Item | Format | Status |
|---|------|--------|--------|
| 1 | Paper PDF | ACL format, ≤6 pages | 🔲 |
| 2 | Screencast video | ≤2.5min, MP4/YouTube | 🔲 |
| 3 | Live demo URL | Public accessible | ✅ (기존 배포) |
| 4 | Experiment results | Tables + Figures | 🔲 |
| 5 | Demo guide page | Web page or README | 🔲 |
| 6 | Source code (optional) | GitHub repo | 🔲 (open-source 결정) |

---

## 10. Implementation Tasks (Dev)

### Phase 1: Experiment Infrastructure (D-6)

#### Task 1.1: Parameter Sweep Runner
```
Location: apps/relay-server/tests/experiments/
Purpose: Config override → E2E call → Metrics collection

Input:  Parameter matrix (JSON)
Output: Per-call metrics (JSON)

Example:
  python -m tests.experiments.sweep \
    --param rms_threshold \
    --values 50,100,150,200,300 \
    --scenario restaurant \
    --repetitions 3
```

#### Task 1.2: Metrics Aggregator
```
Location: apps/relay-server/tests/experiments/
Purpose: JSON logs → CSV → Summary statistics

Input:  Raw call logs (JSON)
Output: Aggregated CSV + summary tables
```

#### Task 1.3: VAD Latency Probe
```
Location: apps/relay-server/src/realtime/local_vad.py
Purpose: 실제 발화 종료 시점 vs VAD speech_stopped 시점 차이 측정

Method:
  - 기존 RMS 하강 패턴으로 실제 발화 종료 추정
  - speech_stopped 이벤트 타임스탬프와 비교
  - Delta = VAD processing latency
```

### Phase 2: Experiments (D-5 ~ D-4)

#### Experiment Execution Order

```
1. RMS Threshold Sweep (45 calls, ~45min)
   → 결과로 optimal RMS 결정

2. Silero Speech Threshold Sweep (45 calls, ~45min)
   → 결과로 optimal speech_prob 결정

3. Silence Duration Sweep (45 calls, ~45min)
   → 결과로 optimal min_silence_frames 결정

4. Joint Optimization (81 calls, ~90min)
   → Top-3 from each × 3 scenarios
   → Final optimal configuration 도출
```

### Phase 3: Visualization (D-4)

```
Figure 2: Latency vs FPR Trade-off
  - X: Average E2E Latency (ms)
  - Y: False Positive Rate (%)
  - Points: Each parameter configuration
  - Pareto frontier highlighted

Figure 3: Echo Prevention Ablation
  - Stacked bar chart: Echo FT reduction per component

Figure 4-5: System Screenshots
  - Web UI (chat + map + call monitoring)
  - Call effect panel (real-time subtitles)
```

### Phase 4: Paper Writing Support (D-3 ~ D-1)

| Item | Tool |
|------|------|
| LaTeX template | ACL 2026 style files |
| Architecture diagram | draw.io / tikz |
| Results tables | Auto-generated from CSV |
| Screenshots | Web app capture |

---

## 11. Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 실험 시간 부족 | High | Medium | 병렬 실행, 핵심 3개 실험만 우선 |
| Twilio API 비용 | Medium | Low | 짧은 통화 (30s), 제한된 반복 |
| 실험 결과가 유의미하지 않음 | High | Low | 현재 production 값이 이미 경험적 최적에 근접 — 그 자체가 findings |
| 논문 분량 초과 | Medium | Medium | Appendix 2 pages 활용 |
| Demo 서버 불안정 | High | Low | Cloud Run auto-scaling + health check |
| 리뷰어가 PSTN 실험 환경 재현 불가 | Medium | High | Video + live demo로 보완 |

---

## 12. Open-Source Strategy

### Option A: Full Open-Source (권장)
- Relay Server + Web App 전체 공개
- ACL demo 심사에서 open-source 우대
- License: Apache 2.0 or MIT

### Option B: Partial Open-Source
- Relay Server core만 공개 (pipeline + VAD)
- Web/Mobile은 비공개
- API keys는 환경변수로 분리 (이미 적용됨)

### Option C: Closed + Demo Only
- 코드 비공개, live demo URL만 제공
- ACL demo 심사에서 불리할 수 있음

### 결정 필요 사항
- [ ] Open-source 범위 결정
- [ ] GitHub repo 정리 (secrets 제거 확인)
- [ ] README 작성 (영문)
- [ ] LICENSE 파일 추가

---

## 13. Evaluation Criteria (ACL System Demo)

ACL System Demo 심사 기준에 맞춘 자기 점검:

| Criteria | Our Strength | Gap |
|----------|-------------|-----|
| **Innovation** | PSTN 실시간 양방향 번역 — 최초 | ✅ Strong |
| **Practical Impact** | 외국인/장애인/콜포비아 실사용 | ✅ Strong |
| **Technical Soundness** | Dual session, pipeline, echo prevention | ✅ Strong |
| **Evaluation** | VAD parameter optimization + ablation | 🔲 실험 필요 |
| **Demo Quality** | 실제 전화 통화 시연 가능 | ✅ Strong |
| **Reproducibility** | Open-source (결정 시) | 🔲 결정 필요 |
| **Presentation** | Screencast + live demo | 🔲 제작 필요 |

---

## 14. Key Decisions Needed

| # | Decision | Options | Deadline |
|---|----------|---------|----------|
| 1 | Open-source 범위 | Full / Partial / Closed | D-5 (2/22) |
| 2 | 실험 규모 | Full (216 calls) / Reduced (90 calls) | D-6 (2/21) |
| 3 | 논문 언어 | English (필수) | - |
| 4 | 저자 목록 | 확정 필요 | D-3 (2/24) |
| 5 | Demo 계정 정책 | 리뷰어 전용 / 공개 | D-2 (2/25) |
| 6 | Conference 선택 확정 | ACL 2026 / EMNLP 2026 fallback | D-7 (2/20) |

# Agent Office 기능 명세

여러 AI 코딩 에이전트(Claude Code, Claude Desktop, Claude Cowork, Codex, Antigravity)의 로컬 기록을 읽어, 아이소메트릭 가상 사무실 안의 캐릭터 움직임으로 보여주는 대시보드다. 에이전트가 파일을 읽으면 자료실로, 셸을 돌리면 서버실로 걸어간다.

---

## 1. 제약 조건

| 항목 | 결정 |
|---|---|
| 런타임 | Node.js 24 이상 |
| 패키지 | npm 의존성 0개. `node:` 내장 모듈만 쓴다. `package.json`은 스크립트 정의용으로만 둔다 |
| 프런트 라이브러리 | PixiJS v8 min 파일 하나를 `public/vendor/`에 복사해서 쓴다 (CDN 의존 금지, 오프라인 동작) |
| SQLite | `node:sqlite`의 `DatabaseSync`를 `readOnly: true`로 연다 |
| OS | Windows 11 우선. 경로는 `os.homedir()`, `process.env.APPDATA`, `process.env.LOCALAPPDATA` 기반으로 만든다 |
| 네트워크 | `127.0.0.1`에만 바인딩. 기본 포트 4777 |
| 로그 파일 | 읽기 전용. 어떤 에이전트 파일도 쓰거나 지우거나 잠그지 않는다 |
| 테스트 | `node --test` (내장 test runner) |

## 2. 디렉터리 구조

```
agent-office/
  AGENTS.md                구현자 규칙
  config.example.json      설정 예시 (config.json은 사용자 로컬, git 제외)
  package.json             scripts만: start, dev(--demo), test
  server.js                진입점
  src/
    lib/
      tail.js              파일별 오프셋 기반 증분 읽기
      scanner.js           디렉터리 재스캔 + 폴링
      paths.js             소스별 기본 경로 계산 (CODEX_HOME 등 반영)
      redact.js            화면으로 보낼 detail 문자열 정제
      git-detect.js        명령 문자열 → git 이벤트
    adapters/
      index.js             adapters/ 폴더 자동 로드
      claude-code.js
      codex.js
      antigravity.js
      claude-desktop.js
    core/
      events.js            공통 이벤트 스키마, 검증 함수
      rooms.js             방 ID와 표시 이름
      state.js             에이전트 상태 머신, 스냅샷/델타 생성
      personality.json     에이전트별 개성 값
    server/
      http.js              정적 파일, /api/state
      sse.js               /events
      demo.js              --demo 가짜 이벤트 생성기
  public/
    index.html             메인 오피스
    mini.html              미니 위젯
    debug.html             텍스트 상태 뷰
    js/                    office, panels, sse-client 등
    assets/
      icons/               claude.svg, openai.svg, gemini.svg
      tiles/               가구·바닥 스프라이트
    vendor/pixi.min.js
  test/
    fixtures/              소스별 정제된 샘플 로그
    *.test.js
  docs/
    SPEC.md
    MILESTONES.md
    reviews/               마일스톤 보고서
```

## 3. 전체 흐름

```
[로그 파일들] → scanner(재스캔 5초, 크기 폴링 1초) → tail(새 줄만)
  → adapter.parseLine() → 공통 이벤트[]
  → redact → state.apply(event) → SSE 델타 → 브라우저
```

`fs.watch`는 Windows에서 이벤트 중복·누락이 잦아 쓰지 않는다. 알고 있는 파일은 1초마다 `fs.stat`으로 크기를 보고, 디렉터리는 5초마다 다시 훑어 새 파일을 찾는다.

## 4. 공통 이벤트 스키마

```js
{
  v: 1,
  source: "claude-code" | "codex" | "antigravity" | "claude-desktop",
  sessionId: string,
  agentId: string,            // 메인 에이전트는 sessionId와 같음, 서브에이전트는 별도 ID
  parentAgentId: string|null,
  project: string|null,       // 정규화한 절대 경로 (소문자 드라이브, 슬래시 통일)
  title: string|null,         // 세션 제목을 얻을 수 있으면
  kind: "session_start" | "session_end" | "turn_start" | "turn_end"
      | "thinking" | "tool_start" | "tool_end" | "message"
      | "spawn" | "despawn" | "git",
  tool: string|null,          // 원래 도구 이름 (Read, run_command, CommandExecution ...)
  room: RoomId|null,
  detail: string|null,        // redact를 거친 짧은 라벨 (최대 40자)
  exitCode: number|null,
  git: { action: "commit" | "push" | "mr" } | null,
  ts: number,                 // 이벤트 시각 (ms)
  startedAt: number|null,     // 지연 소스(Codex)의 재생용
  endedAt: number|null,
  live: boolean               // false면 늦게 도착한 이벤트 → 프런트가 빠르게 재생
}
```

방 ID: `library`(자료실), `dev`(개발실), `server`(서버실), `search`(정보검색실), `meeting`(회의실), `desk`(내 자리), `lounge`(라운지), `elevator`.

## 5. 어댑터 명세

모든 어댑터는 같은 인터페이스를 export한다.

```js
export default {
  id: "codex",
  roots(): string[],                 // 스캔할 루트 디렉터리
  match(filePath): boolean,          // 이 어댑터가 처리할 파일인지
  createSession(filePath): Session,  // 파일 하나당 상태 객체 (대기열 등)
  parseLine(session, line): Event[], // 모르는 형식이면 [] 반환, 절대 throw 하지 않음
  poll?(): Event[]                   // 파일 외 소스(SQLite, lock 파일) 주기 확인용
}
```

어댑터는 원문(프롬프트, thinking, 인수, 결과, stdout, diff)을 이벤트에 담지 않는다. 필요한 판단(종료 코드, git 감지, 파일 이름)은 어댑터 안에서 끝내고 결과만 넘긴다.

### 5.1 Claude Code (실시간)

- 경로: `~/.claude/projects/<인코딩된 프로젝트>/<sessionId>.jsonl`, 서브에이전트 로그가 하위 폴더에 따로 생기는 버전도 있으니 재귀로 찾는다.
- 필드: 줄마다 `type`(user/assistant 등), `sessionId`, `cwd`, `timestamp`, `isSidechain`, `message.content[]`.
- assistant의 `tool_use` 블록(`id`, `name`, `input`) → `tool_start`. user의 `tool_result` 블록(`tool_use_id`, `is_error`) → `tool_end`. `id`로 짝짓는다.
- Bash `tool_result`는 종료 코드를 직접 주지 않을 수 있다. `is_error === false`를 성공으로 본다.
- `Task`/`Agent` 도구 → `spawn`, 결과가 오면 `despawn`. `isSidechain: true` 줄은 해당 서브에이전트의 이벤트로 보낸다.
- thinking 블록이나 tool_use 없는 텍스트만 있는 assistant 줄 → `thinking` 또는 `message`.
- 로그 형식은 제품 버전에 따라 달라질 수 있다. 지원하지 않는 줄은 조용히 건너뛴다.

| 도구 | 방 |
|---|---|
| Read, Grep, Glob, LS, NotebookRead | library |
| Edit, Write, MultiEdit, NotebookEdit | dev |
| Bash, BashOutput | server |
| WebSearch, WebFetch, `mcp__*` | search |
| TodoWrite, ExitPlanMode | meeting |
| 그 외 | desk |

### 5.2 Antigravity (실시간)

- 경로: `~/.gemini/antigravity/brain/<conversation-id>/.system_generated/logs/transcript.jsonl`. `transcript_full.jsonl`과 `steps/`는 읽지 않는다.
- 줄 필드: `step_index`, `source`(USER/MODEL), `type`(USER_INPUT/PLANNER_RESPONSE/GENERIC), `status`, `created_at`, `thinking`, `tool_calls[]`, `content`.
- 처리 규칙:
  - `USER_INPUT` → `turn_start`
  - `PLANNER_RESPONSE` + `tool_calls` 있음 → 도구마다 `tool_start`, 세션 대기열(FIFO)에 넣음
  - `PLANNER_RESPONSE` + `tool_calls` 없음 + `thinking` 있음 + `content` 없음 → `thinking`
  - `PLANNER_RESPONSE` + `tool_calls` 없음 + `content` 있음 → `message`, `turn_end`
  - `GENERIC` → 대기열에서 하나 꺼내 `tool_end`. `content`가 `/^Command exited with code (\d+)/`면 exitCode 설정
  - step_index 계산으로 짝짓지 않는다. 응답 하나에 tool_calls가 여러 개일 수 있다
- 세션 메타: `~/.gemini/antigravity/conversation_summaries.db`의 `conversation_summaries` 테이블에서 `conversation_id`, `workspace_uris`(`file:///` 제거 후 경로로 변환, 빈 값이면 null), `status`. `poll()`에서 10초마다 읽어 캐시한다. DB가 잠겨 있거나 없으면 조용히 건너뛴다.
- 출퇴근: `~/.gemini/antigravity/presence/<id>.lock`이 생기면 `session_start`, 사라지면 `session_end`.

| 도구 | 방 |
|---|---|
| read_file | library |
| run_command (명령이 rg, grep, findstr, Select-String으로 시작) | library |
| run_command (그 밖) | server |
| write_file, edit_file | dev (대상 파일 이름이 task.md면 meeting) |
| search_web, call_mcp_tool, `mcp_*` | search |
| invoke_subagent | `spawn` (방 없음, 엘리베이터 연출) |
| ask_question | desk (1차 범위에서는 승인 대기 연출 없음) |
| 그 외 | desk |

### 5.3 Codex (지연 반영)

- 경로: `$CODEX_HOME/sessions/YYYY/MM/DD/rollout-*.jsonl`, `CODEX_HOME`이 없으면 `%USERPROFILE%\.codex`. 날짜 폴더가 매일 생기므로 `sessions` 루트를 재귀 스캔한다.
- 줄 형식: `{timestamp, type, payload}`.
- 처리 규칙:
  - `session_meta` → `payload.id`, `payload.cwd`로 세션 생성, `session_start`
  - `event_msg/task_started` → `turn_start`
  - `event_msg/item_completed`의 `item.type`별:
    - `CommandExecution` → server (명령이 검색 계열이면 library). `tool_start`+`tool_end` 한 쌍을 만들고 `startedAt`/`endedAt`은 `payload.started_at_ms`/`completed_at_ms`, exitCode는 `item.exit_code`
    - `FileChange` → dev. `changes`에서 파일 경로만 추출
    - `McpToolCall` → search. detail은 `server/tool`
    - `Extension` → search
    - `Reasoning` → `thinking`
    - `AgentMessage` → `message`
    - `UserMessage`, `ImageView` → 무시
  - `event_msg/task_complete` → `turn_end`
  - `response_item/*`, `token_count`, `token_usage_record`, `turn_context`, `world_state`, `thread_settings_applied` → 무시
- 이 소스의 이벤트는 `live: false`로 보낸다. 프런트는 `startedAt`~`endedAt` 순서를 지키되 최대 4배속으로 재생한다.
- 완료 시점에 기록되는 이벤트는 `live: false`로 보내고, 프런트에서 시작 시각과 종료 시각을 기준으로 재생한다.

### 5.4 Claude Desktop

- Code 탭의 기록은 Claude Code와 같은 `~/.claude/projects/**.jsonl`에 저장된다. 줄의 `entrypoint`가 `claude-desktop`이면 출처를 `claude-desktop`으로 표시한다.
- 예전 데스크톱 에이전트 모드 기록 `%APPDATA%\Claude\local-agent-mode-sessions\**\*.jsonl`도 지원한다. 줄 형식은 Claude Code JSONL과 같고, 출처만 `claude-desktop`으로 표시한다.
- `cwd`가 PC의 절대 경로가 아니면 `project`는 null(무소속 층)로 둔다.

### 5.5 Claude 계열 공통 규칙

- `tool_result.is_error`는 Anthropic API 규약상 에러일 때만 `true`로 들어가고 성공이면 생략된다. 판정은 `is_error === true`면 실패, 그 외는 성공이다. 성공이면 `exitCode: 0`, 실패면 `1`. git 감지도 이 판정을 따른다.
- 서브에이전트는 별도 파일이나 `isSidechain: true` 줄로 들어온다. 서브에이전트 파일 안의 `sessionId`는 부모 세션 ID와 같을 수 있으므로 `agentId`를 덮어쓰지 않는다. 서브에이전트 `agentId`는 줄의 `agentId` 필드가 있으면 그것, 없으면 파일 이름으로 만든다. 서로 다른 서브에이전트가 하나로 합쳐지면 안 된다.

## 6. 개인정보 규칙 (redact.js)

화면으로 나가는 문자열은 `detail` 하나뿐이고, 다음만 허용한다.

- 도구 이름
- 파일은 basename만 (`src/a/b/Foo.java` → `Foo.java`)
- MCP는 `server/tool` 이름만
- 셸은 첫 토큰만 (`git`, `npm`, `./gradlew`)
- 세션 제목은 소스가 제목을 제공할 때만

발표 모드(설정 `presentationMode: true` 또는 UI 토글)에서는 제목과 세부 내용을 숨기고 프로젝트 이름을 `Project A/B/C`로 치환한다. 화면에 표시하는 에이전트 이름에서는 짧은 ID도 숨긴다.

## 7. 상태 머신 (state.js)

```
arriving → working(room) ⇄ thinking
working/thinking ─(이벤트 없음 idleAfterSec=60)→ idle
idle ─(마지막 이벤트 후 goneAfterSec=360초)→ leaving → gone
어느 상태든 새 이벤트 → 즉시 working 또는 thinking
session_end → leaving → gone (Antigravity lock 해제 등)
spawn → 엘리베이터에서 서브에이전트 arriving
despawn → 서브에이전트 leaving
```

- 층(floor) = project. project가 null이면 `무소속` 층.
- 층 정렬: 최근 활동 순. 표시 최대 6층, 나머지는 "더 보기".
- 서버는 스냅샷 `{floors:[{project, agents:[...]}], mailbox:{[project]: count}, now}`와 델타를 만든다.

### 7.1 상태 머신 세부 규칙

- 복원 이벤트도 state에 적용한다. 단 SSE로 보내지 않고, 타이머 판정은 이벤트의 `ts`와 현재 시각 차이로 한다. 그러면 2시간 전에 멈춘 세션은 복원 직후 바로 gone이 된다.
- 최소 체류 시간: 한 방 방문은 화면에서 최소 3초 유지한다. `tool_start`와 `tool_end`가 1초 안에 연달아 오거나(Codex처럼 완료 후 한꺼번에 기록되는 경우) `tool_start` 없이 `tool_end`만 오면, `tool_end` 시점에 그 방으로 이동시키고 3초 머물게 한다. 이 처리는 서버 state가 아니라 프런트의 이동 큐에서 한다. 서버 state는 마지막 이벤트 기준 현재 방만 갖는다.
- 서브에이전트 연결: `spawn` 이벤트가 오면 부모 아래에 빈 자식 슬롯을 만든다. 처음 보는 `agentId`가 `parentAgentId`를 달고 오면 그 부모의 가장 오래된 빈 슬롯에 묶고, 빈 슬롯이 없으면 새 자식으로 만든다. 자식 이벤트가 끝내 오지 않는 소스(Antigravity 등)는 빈 슬롯 자체를 캐릭터로 보여준다. `despawn`은 그 부모의 가장 오래된 활성 자식을 leaving으로 보낸다.
- 층 이름은 project 경로의 마지막 폴더 이름. project가 null이면 `무소속` 층.

## 8. 서버 API

| 경로 | 내용 |
|---|---|
| `GET /` | public/index.html |
| `GET /mini` | public/mini.html |
| `GET /debug` | public/debug.html |
| `GET /api/state` | 현재 스냅샷 JSON |
| `GET /api/settings` | 화면 설정 JSON |
| `GET /api/diagnostics` | 소스별 이벤트 수, 감시 중인 파일 수, 알 수 없는 로그 줄 수. 로그 내용은 포함하지 않음 |
| `POST /api/presentation` | 발표 모드 변경. 루프백 요청만 허용 |
| `GET /events` | SSE. 접속 직후 `event: snapshot`, 이후 `event: delta`, 15초마다 `: ping` |

`POST /api/presentation` 요청 본문은 `{"presentationMode": true}` 또는 `false`. 응답은 현재 값을 담은 같은 모양의 JSON이다. 실행 중인 서버의 설정만 바꾸며 `config.json`은 수정하지 않는다. 잘못된 본문은 400, 1KB 초과는 413, POST가 아닌 메서드는 405로 응답한다.

시작할 때 최근 2시간 안에 수정된 파일만 대상으로 마지막 500줄을 읽어 상태를 복원한 뒤(이때 이벤트는 SSE로 보내지 않음) tail을 시작한다.

## 9. 화면

화면은 층 안내, 아이소메트릭 오피스, 에이전트 목록과 활동 로그로 구성한다. 테마마다 같은 평면도를 다른 시각 언어로 표현한다.

- 왼쪽 "층별 안내": 층 카드(층 번호, 프로젝트 이름, 세션 수, 활동 점). 펼치면 세션 목록. 클릭하면 해당 층으로 전환.
- 가운데: PixiJS 아이소메트릭 맵. 마우스 휠 줌, 드래그 이동, 리셋 버튼. 방 8개(자료실, 개발실, 서버실, 정보검색실, 회의실, 내 자리 구역, 라운지, 엘리베이터 홀). 상단에 현재 층 라벨, 우측 상단 LIVE 표시.
- 오른쪽: "사무실 사람들"(아바타 + 상태 + 도구 사용 횟수), "활동 로그"(시각 + 에이전트 아이콘 + detail, 최근 50개), "어디서 무엇을 하나" 범례.
- 캐릭터: 2등신. 브랜드 아이콘은 머리 위 이모트의 왼쪽 아래 모서리에 붙는 배지로 표시한다. 옷 색은 Claude `#D97757`, Codex `#10A37F`, Antigravity `#4285F4`, Claude Desktop `#C2410C`. 서브에이전트는 부모 아이콘 + 모자 색 차이.
- 말풍선: 둥근 흰 박스. thinking이면 "고민 중…" + 경과 초, 도구 중이면 detail.
- 아이콘: simple-icons의 `anthropic`, `openai`, `googlegemini` SVG를 `public/assets/icons/`에 복사해 쓴다. 직접 그리지 않는다.
- 방 가구와 캐릭터는 선택된 테마의 그림 모듈로 표시한다.

### 9.1 평면도와 표시 규칙

바닥·벽·가구·캐릭터·이름표·말풍선은 테마 그림 모듈이 담당한다. `public/floor-plan.js`는 좌표·좌석·유휴 지점·좌석 배정을 담당한다.

방을 따로 떨어진 마름모로 그리지 않는다. 큰 바닥판 하나 위에 방을 구역으로 나누는 구조다. 참고 이미지처럼 한 층 전체가 이어진 사무실로 보여야 한다.

- 바닥판: 아이소메트릭 타일 20×14 (x축은 오른쪽 아래, y축은 왼쪽 아래 방향). 타일 하나는 화면 기준 가로 64px, 세로 32px.
- 외벽: 바닥판의 뒤쪽 두 변(x=0 변, y=0 변)에만 높이 80px 벽. 앞쪽 두 변은 벽 없이 바닥 테두리만.
- 방 구역(타일 좌표, 끝 포함):

| 방 | x | y | 비고 |
|---|---|---|---|
| library 자료실 | 0–5 | 0–5 | 뒤쪽 벽에 책장 |
| meeting 회의실 | 6–11 | 0–4 | 가운데 긴 테이블 |
| elevator 엘리베이터 홀 | 12–13 | 0–2 | 뒤쪽 벽에 엘리베이터 문 2개, 층 표시등 |
| server 서버실 | 14–19 | 0–5 | 랙 3~4개 |
| dev 개발실 | 6–13 | 5–10 | 책상 2열(모니터 포함), 가장 넓은 구역 |
| search 정보검색실 | 0–5 | 7–13 | 창가 쪽, 지구본·모니터 |
| desk 내 자리 | 14–19 | 7–13 | 개인 책상 4~6개 |
| lounge 라운지 | 7–12 | 11–13 | 소파, 커피머신, 정수기 |

- 방 경계: 방 안쪽 뒤쪽 두 변에 높이 24px 낮은 칸막이. 방 이름은 칸막이 위 작은 팻말. 복도(어느 방에도 속하지 않은 타일)는 기본 바닥색.
- 좌석: 방마다 사람이 설 타일 좌표를 4~8개 정해 두고(`seats`), 같은 방의 에이전트는 서로 다른 좌석에 배정한다. 좌석은 그 방에 들어온 순서로 배정하고 나갈 때 반납한다. 좌석이 모자라면 복도 쪽 인접 타일을 쓴다.
- 유휴 지점(`idleSpots`): sofa·coffee·water는 lounge에 둔다.
- 깊이 정렬: 캐릭터와 가구 모두 `x+y` 타일 값으로 zIndex.
- 카메라: 초기 화면에서 바닥판이 맵 영역 가로의 90%를 채운다. 드래그 오프셋은 줌을 바꿔도 유지한다.
- 엘리베이터: 새 에이전트는 엘리베이터 홀 좌석에서 나타나 목적 방으로 걸어간다. 퇴근(leaving)은 엘리베이터로 걸어가서 사라진다.

글자와 라벨:
- 화면 배율 1 기준 이름표 12px, 말풍선 13px. 줌 축소 시에도 말풍선 글자가 화면상 11px 아래로 내려가지 않게 역보정한다.
- 말풍선은 최대 2줄. 같은 방에서 말풍선이 겹치면 좌석 순서대로 위로 쌓는다.
- 말풍선 문구는 `동작 · detail` 형태. 동작은 방 기준: library "자료 찾는 중", dev "코드 수정 중", server "명령 실행 중", search "검색 중", meeting "계획 세우는 중", desk "정리 중". thinking이면 "고민 중… N초".
- 화면에 영어 내부 값(room id, status, kind, `McpToolCall` 같은 원래 타입 이름)을 그대로 쓰지 않는다. 상태는 작업 중/고민 중/쉬는 중/퇴근 중, 방은 한글 이름.
- 이름표: `에이전트 이름 · 짧은 ID 4자`. 세션 제목이 있으면 제목 우선(최대 14자).
- 활동 로그 한 줄: 시각, 에이전트 아이콘, 이름, 말풍선과 같은 문구.

### 9.2 라벨 표시 정책

캐릭터마다 이름표와 말풍선을 항상 띄우는 대신 사람이 몰리는 사무실에서는 정보를 단계적으로 줄인다.

- 라벨은 세 단계다.
  1. 전체 라벨(이름표 + 말풍선): working·thinking 상태이면서 묶음에 속하지 않은 캐릭터, 그리고 마우스를 올리거나 클릭으로 고른 캐릭터.
  2. 이모트만 표시: idle·arriving·leaving 캐릭터. 머리 위 활동 이모트는 계속 보인다.
  3. (현재 꺼 둠) 묶음 칩: `office.js`의 `BUNDLE_CHIPS`가 `false`라서 겹친 캐릭터도 이모트를 각각 보여 주고, 이름표는 자리가 있을 때만 뜬다. 아래 칩 규칙은 `BUNDLE_CHIPS`를 `true`로 켰을 때의 동작이다. 이모트 고정 bounds가 실제로 겹치는 캐릭터가 3명 이상일 때만 무리 위에 칩 하나를 표시한다. 2명만 겹치면 뒤쪽 캐릭터 이모트를 0.55배로 줄이고 두 이모트를 모두 보인다. 칩에는 브랜드 아이콘을 사람 수만큼 최대 3개 표시하고, 초과 인원은 `+N`으로 표시한 뒤 `N명 ·`와 활동 기호(최대 3개)를 잇는다. 예: 아이콘 3개 `+2 5명 ·` 기호들. `+N · N명`처럼 인원 수를 중복 표시하지 않는다. 칩에 마우스를 올리면 무리 안 캐릭터 전체 라벨을 세로 목록으로 펼친다.
- 이모트는 머리 위 고정 위치에 둔다. 겹침 판정은 애니메이션이 없는 고정 bounds로 한다. 묶음 칩은 구성 캐릭터 머리 중앙 위에 두고, 칩 하단과 머리 위 표식 사이를 8px 띄운다. 방 팻말과 겹치면 칩은 움직이지 않고 팻말을 흐리게 한다. 이 규칙은 메인 오피스·위젯·PiP에 똑같이 적용한다. 활동 종류 변경은 새 상태가 500ms 이상 유지된 뒤 반영한다.
- 클릭으로 고른 캐릭터는 오른쪽 "사무실 사람들" 목록에서도 강조하고, 목록 항목을 클릭해도 같은 캐릭터를 고른다.
- 겹침 검사는 실제 렌더링된 화면 좌표(getBounds)를 기준으로 한다.
- 검증 스크립트 `scripts/check-labels.mjs`: crowd 데모를 브라우저로 열어 10초 동안 1초마다 화면에 보이는 라벨·이모트·칩의 getBounds를 모아 서로 겹치는 쌍이 0개인지 확인하고 결과를 출력한다.

엘리베이터 홀 정체 방지:
- 출근한 캐릭터는 엘리베이터 좌석에 1초만 머물고 곧바로 목적지(이벤트가 없으면 내 자리)로 이동한다.
- 퇴근 중 캐릭터는 엘리베이터 좌석을 쓰지 않고 문 앞(12.9, 0.6)으로 걸어가서 페이드아웃한다.
- 오른쪽 목록의 방 이름은 서버 state가 아니라 화면에서 캐릭터가 실제로 있는 곳(유휴 지점 포함)을 쓴다.

### 9.3 활동 그림 언어

캐릭터 이모트와 방 팻말에서 같은 활동 기호를 써 방의 역할과 캐릭터의 일을 함께 알아볼 수 있게 한다. 그림 구현은 `public/office-activity.js`와 테마별 `activityGlyphs`가 맡는다.

- 활동 종류는 read, code, run, search, plan, reply, think, rest, walk, deliver의 열 가지.
- `activityOf({ status, room, delivering })`는 기존 호출과 호환되도록 종류 문자열을 반환한다. 화면의 생각 배지는 `activityPresentationOf()`의 `{ kind, think }`를 사용한다.
- working은 방의 활동 기호를 따른다. thinking 중 방이 library·dev·server·search·meeting·lounge·elevator이면 해당 방 기호를 유지하고, 이모트 오른쪽 위에 지름 약 9px 생각 배지(점 세 개가 차례로 깜빡임)를 붙인다. 방 정보가 없거나 알 수 없을 때, 기본 응답 데스크(`desk`)에서는 기존 생각 구름만 표시한다.
- idle은 rest, arriving·leaving·gone은 walk, 배송 중은 deliver 기호를 쓴다. 이 상태들은 생각 배지를 붙이지 않는다.
- `activityGlyphs`가 있는 테마는 read·code·run·search·plan·reply의 기호 이름 여섯 개를 모두 정의한다. 기호 이름은 실제 그림 구현과 일치해야 한다. 선택 항목이 없는 테마는 기존 사무실 기호를 쓴다. rest·walk·deliver는 기존 기호를 유지한다.
- 이모트와 방 팻말은 테마 기호를 함께 쓴다. 손에 든 소품·자세·표정은 `drawActor`가 그리며 테마별 변경은 선택 사항이다.
- 라벨 정책(9.2): 이모트는 모든 캐릭터에 항상 표시한다. 브랜드 아이콘은 지름 14px 흰 원, 에이전트 색 1.5px 테두리, 9px 아이콘으로 이모트 왼쪽 아래에 약 1/3 겹쳐 붙인다. 배지는 이모트의 자식이므로 같은 역보정과 0.55 축소를 따른다. 생각 배지는 오른쪽 위에 붙이고 브랜드 배지·얼굴과 겹치지 않게 한다. 묶음 칩에는 무리 안 이모트 종류를 최대 3개까지 작은 원으로 보여 준다.
- 애니메이션: `actor.tick(t, moving)`, `emote.tick(t)`를 매 프레임 호출한다. actor는 30fps로 스스로 다시 그린다.
- 화면 캐릭터는 `drawActor`를 사용한다.

## 10. 운영 기능

### 10.1 git 이벤트 연출
- 감지: 성공한 셸 실행(exitCode 0 또는 Claude의 `is_error: false`)의 명령 문자열에 대해 `git-detect.js`가 판정.
  - commit: `/\bgit\b(?:\s+-\S+)*\s+commit\b/`
  - push: `/\bgit\b(?:\s+-\S+)*\s+push\b/`
  - mr: `/\b(glab\s+mr\s+create|gh\s+pr\s+create)\b/`, 또는 MCP 도구 이름에 `merge_request`와 `create`가 함께 들어간 경우
- commit → 해당 층 우편함 편지 +1. 5통 초과는 숫자 배지. 로컬 자정에 초기화.
- push/mr → 캐릭터가 상자를 들고 엘리베이터까지 이동, 상자만 내려감.

### 10.2 시간대별 조명
- 07~18시 낮, 18~21시 노을, 21~07시 밤. 전환은 30분에 걸쳐 보간.
- 전체 오버레이(multiply) + 사용 중인 책상 모니터 글로우(additive).
- 22~06시 working 에이전트에게 "야근" 배지와 책상 위 야식 상자.
- 설정 `lighting: "auto" | "day"`.

### 10.3 유휴 행동
- idle 진입 시 개성의 `idleSpots` 가중치로 라운지의 소파/커피머신/정수기 중 하나로 이동한다. 20~40초마다 다른 곳으로 옮긴다. 해당 좌석이 모두 차면 라운지 앞 복도에 줄을 선다.
- 마지막 이벤트 뒤 6분이 지나면 idle 상태에서 퇴근을 시작한다. sleeping 상태와 Zzz 연출은 사용하지 않는다.
- 새 이벤트가 오면 하던 행동을 즉시 끊고 목적지로 이동.

### 10.4 에이전트별 개성 (personality.json)
```json
{
  "claude-code":    { "speed": 1.0, "bounce": 0.6, "idleSpots": {"sofa": 3, "coffee": 1}, "idleAnim": "read" },
  "codex":          { "speed": 1.3, "bounce": 0.3, "idleSpots": {"coffee": 3, "water": 1}, "idleAnim": "sip" },
  "antigravity":    { "speed": 1.1, "bounce": 1.0, "idleSpots": {"sofa": 3, "water": 1}, "idleAnim": "stretch" },
  "claude-desktop": { "speed": 0.9, "bounce": 0.5, "idleSpots": {"sofa": 2, "coffee": 1}, "idleAnim": "read" },
  "subagentSpeedMultiplier": 1.1
}
```

### 10.5 미니 위젯 (/mini)
- 가로 한 줄: 에이전트 아이콘 + 상태 점(초록 working, 노랑 thinking, 회색 idle, 흐린 회색 gone) + 현재 방 이모지 아이콘. 호버 시 세션 제목.
- 배경 투명 지원, 폭 360px 기준.
- 실행 방법은 README에: `msedge --app=http://127.0.0.1:4777/mini` + PowerToys Always On Top.

## 11. 추가 기능 후보

승인 대기 알림, 같은 파일 충돌 감지, 퇴근 리포트, 타임랩스 리플레이, 토큰 전광판, 사원 평가표, 클릭 시 VS Code 열기.

## 12. 데스크톱 위젯

브라우저 PiP는 브라우저가 붙이는 위쪽 바(주소·탭 복귀·닫기)를 없앨 수 없다. 테두리 없는 창은 Tauri 2 데스크톱 래퍼로 만든다.

### 12.1 구조
- 위치: `desktop/` (독립 Cargo 프로젝트, `desktop/src-tauri`). 루트의 Node 서버는 그대로 패키지 0개를 유지한다. 루트 package.json에 의존성을 추가하지 않는다.
- 창은 원격 URL `http://127.0.0.1:4777/widget`을 띄운다. 프런트 번들을 따로 만들지 않는다.
- 서버에 `/widget` 경로 추가: PiP 창과 같은 내용(오피스/미니 토글, 호버 툴바)을 창 전체 크기로 그리는 독립 페이지. PiP 렌더링 코드를 재사용할 수 있게 모듈로 분리한다. 브라우저로 열어도 동작해야 한다.

### 12.2 창
- `decorations: false`, `transparent: true`, `shadow: false`, `alwaysOnTop: true`, `skipTaskbar: true`, `resizable: true`, 기본 420×300.
- 페이지가 직접 둥근 모서리(14px)와 옅은 그림자를 그린다. 바깥은 완전 투명.
- 위치·크기 기억: `tauri-plugin-window-state`.
- 미니 모드는 창 크기를 420×64로, 오피스로 돌아오면 이전 오피스 크기로.

### 12.3 조작 (페이지 쪽)
- `withGlobalTauri: true`로 `window.__TAURI__`가 있으면 데스크톱 모드로 동작, 없으면 일반 브라우저 페이지로 동작.
- 드래그 이동: 툴바를 제외한 빈 배경에서 마우스를 누르면 `getCurrentWindow().startDragging()`. 캐릭터·칩 클릭과 충돌하지 않게 4px 이상 움직였을 때만 드래그 시작.
- 툴바(호버 시 표시): 오피스·미니 전환, 핀, 설정, 숨기기. 숨기기는 창을 트레이로 보낸다. 완전 종료는 트레이 메뉴에서 한다.
- capability는 원격 URL `http://127.0.0.1:4777/*`에만 `core:window:allow-start-dragging`, `allow-hide`, `allow-set-size`, `allow-show`를 허용한다. 그 외 권한은 주지 않는다.

### 12.4 트레이와 서버
- 트레이 메뉴: Agent Office 버전, 보이기/숨기기, 오피스, 미니, 항상 위, 마우스 통과, Windows 시작 시 실행, 진단 내보내기, 연결 상태, 종료.
- 실행 시 `http://127.0.0.1:4777/api/state`를 확인해서 서버가 없으면 `node server.js`를 콘솔 창 없이(CREATE_NO_WINDOW) 띄우고, 앱 종료 때 자기가 띄운 서버만 정리한다. 서버 경로는 설정 파일(`desktop/config.json`)의 `serverDir`, 기본값은 `desktop/`의 상위 폴더.
- 서버가 이미 떠 있으면 그대로 붙는다. 진단 내보내기는 경로와 원문 없이 수치만 파일로 저장한다.
- 단일 인스턴스: `tauri-plugin-single-instance`.

### 12.5 빌드와 실행
- 개발: `cd desktop && cargo tauri dev`
- 배포: `cargo tauri build` → exe/msi. README에 tauri-cli 설치(`cargo install tauri-cli --version "^2"`)와 실행법을 적는다.
- WebView2는 Windows 11 기본 포함.

### 12.6 배경 투명도 (데스크톱 위젯 전용)
- 브라우저 PiP 창은 배경을 투명하게 만들 수 없다(브라우저가 불투명 창으로 그림). 이 기능은 Tauri 위젯에서만 제공하고, PiP에서는 메뉴를 숨긴다.
- 설정 패널의 투명도 구역에서 조절:
  - 배경: 0~100% (기본 100). 사무실 바깥 배경판(둥근 모서리 패널과 그림자)의 불투명도. 0이면 사무실만 바탕화면 위에 떠 있다. PixiJS는 `backgroundAlpha: 0`으로 초기화하고 배경판은 별도 레이어로 그린다.
  - 전체: 30~100% (기본 100). 사무실·캐릭터를 포함한 위젯 전체 불투명도. 30% 아래로는 내려가지 않게 한다.
- 라벨(이름표·말풍선·칩)과 툴바는 "전체" 값과 상관없이 최소 85% 불투명도를 유지해 글자가 읽히게 한다.
- 값은 위젯 설정에 저장해 재실행 시 복원(localStorage가 아니라 Tauri 쪽 설정 파일 또는 window-state와 같은 저장소).
- 마우스 통과: 위젯 핀 버튼, 트레이 메뉴, Ctrl+Alt+O 단축키가 같은 상태를 바꾼다. 켜진 동안에는 화면 모서리의 핀 영역만 클릭할 수 있다.
- 미니 모드에도 같은 값 적용.

## 13. 시점 회전

사무실은 45도 간격으로 8방향을 볼 수 있다. 짝수 번호(0·90·180·270도)는 정면, 홀수 번호(45·135·225·315도)는 사선이며 기본값은 45도다. 본 화면은 ⟲ ⟳ 버튼과 `[` `]` 키, 위젯과 PiP는 설정의 ⟳ 버튼으로 돌린다. 마지막 시점은 localStorage `agent-office.view`에 남는다.

이동·좌석·쉼터 계산은 늘 0번 사선 좌표(sim)로 하고, 그릴 때만 `simToView`로 바꾼다. 그래서 회전해도 에이전트 경로와 좌석 배정은 달라지지 않는다. 벽은 보는 쪽에서 먼 두 변에만 세우고, 앞쪽 벽에 붙은 높은 가구(책장, 서버랙)는 낮게 잘라 안이 가려지지 않게 한다.

## 14. 묶음 카드 자리

겹친 에이전트를 펼친 목록 카드는 칩 옆이 아니라 화면에서 사무실 외곽선과 덜 겹치는 빈 곳에 놓는다(`public/card-placement.js`). 겹침 넓이가 같으면 칩에 가까운 자리를 고르고, 위젯 도구막대 자리는 크게 피한다. 칩과 카드가 멀면 가는 선으로 잇는다. 칩에서 카드로 포인터를 옮기는 동안 0.7초는 접히지 않는다. 위젯에서는 행 높이를 19px로 줄인다.

## 15. Cowork 인박스

클라우드에서 도는 Claude Cowork 세션은 PC에 로그를 남기지 않는다. 대신 세션이 직접 `%LOCALAPPDATA%\AgentOffice\inbox\<세션>.jsonl`(환경 변수 `AGENT_OFFICE_INBOX`로 바꿀 수 있고, Windows가 아니면 `~/.agent-office/inbox`)에 상태를 한 줄씩 적는다.

```
node scripts/cowork-report.mjs <세션> <kind> [도구이름]
{"v":1,"ts":1792000000000,"kind":"tool_start","tool":"Edit"}
```

`cowork` 어댑터는 `v`, `ts`, `kind`, `tool`만 읽는다. 그 밖의 필드는 버리고 `detail`은 늘 null이다. `mcp__` 도구는 서버 이름을 숨기고 `mcp`로 줄인다. 방은 Claude Code와 같은 도구 규칙을 따르고, `thinking`은 회의실이다. 출처 이름은 `Claude Cowork`, 색은 `#7C5CDB`다.

진짜 로그가 아니라 세션이 직접 보고하는 방식이라, 보고가 빠진 구간은 화면에도 빠진다. 세션이 끝나면 다른 출처와 같은 유휴·퇴근 시간 규칙으로 사라진다.

# Installation

## Windows release

Download the installer or portable archive from the project's Releases page. Run the installer, or extract the portable archive and start `agent-office-desktop.exe`. The desktop app starts its local server when needed and places the widget in the notification area.

Windows SmartScreen may warn that the installer is unsigned. If you trust the release source, select **More info** and then **Run anyway**. Do not bypass a warning for a file you did not obtain from the project release page.

## macOS release (testing, unverified)

Download the DMG from Releases, open it, and drag Agent Office to Applications. The app is not notarized. If Gatekeeper blocks the first launch, Control-click Agent Office and choose **Open**. If it remains blocked, run:

```sh
xattr -dr com.apple.quarantine /Applications/Agent\ Office.app
```

The click-through shortcut is **Control+Option+O**. macOS log paths are listed in the README and have not been verified on a Mac. Settings are stored under `~/Library/Application Support/local.agent-office.widget`.

## Run from source

Install Node.js 24 or newer, extract or clone the source, open PowerShell in the project folder, and run:

```powershell
npm start
Start-Process http://127.0.0.1:4777
```

No npm packages need to be installed. The server reads local agent records and serves the dashboard only on loopback.

## Settings and removal

The desktop app stores settings under `%APPDATA%\local.agent-office.widget`. To remove the desktop app, use **Settings → Apps → Installed apps → Agent Office → Uninstall**. The settings folder remains after uninstall; delete it manually only if you also want to remove saved widget preferences and desktop configuration.

The portable version can be removed by closing the app and deleting its extracted folder. Local agent records are never changed by uninstalling Agent Office.

---

# 설치 안내 (한국어)

## Windows 릴리스

프로젝트 Releases에서 설치 파일이나 포터블 압축 파일을 받으세요. 설치 파일을 실행하거나 압축을 푼 뒤 `agent-office-desktop.exe`를 실행하면 됩니다. 데스크톱 앱은 필요할 때 로컬 서버를 시작하고 알림 영역에 위젯을 표시합니다.

설치 파일에 서명이 없으면 Windows SmartScreen 경고가 나올 수 있습니다. 프로젝트 Releases에서 받은 파일이 맞다면 **추가 정보 → 실행**을 선택하세요. 출처를 모르는 파일의 경고는 무시하지 마세요.

## macOS 릴리스 (시험 중·미검증)

Releases에서 DMG를 내려받아 열고 Agent Office를 Applications 폴더로 끌어다 놓으세요. 앱은 공증하지 않은 상태입니다. Gatekeeper가 처음 실행을 막으면 Agent Office를 Control-클릭하고 **열기**를 선택하세요. 계속 막히면 터미널에서 다음 명령을 실행하세요.

```sh
xattr -dr com.apple.quarantine /Applications/Agent\ Office.app
```

클릭 통과 단축키는 **Control+Option+O**입니다. macOS 로그 경로는 README에 적었으며 실제 Mac에서 검증하지 않았습니다. 설정은 `~/Library/Application Support/local.agent-office.widget`에 저장됩니다.

## 소스에서 실행

Node.js 24 이상을 설치하고 PowerShell에서 프로젝트 폴더를 연 뒤 다음 명령을 실행합니다.

```powershell
npm start
Start-Process http://127.0.0.1:4777
```

npm 패키지 설치는 필요하지 않습니다. 서버는 로컬 에이전트 기록을 읽고 루프백 주소에서만 대시보드를 제공합니다.

## 설정과 제거

데스크톱 앱 설정은 `%APPDATA%\local.agent-office.widget`에 저장됩니다. **설정 → 앱 → 설치된 앱 → Agent Office → 제거**에서 앱을 삭제할 수 있습니다. 저장된 위젯 설정과 데스크톱 구성을 지우려면 제거 뒤 설정 폴더를 직접 삭제하세요.

포터블 버전은 앱을 종료한 뒤 압축을 푼 폴더를 삭제하면 됩니다. Agent Office를 제거해도 에이전트의 로컬 기록은 바뀌지 않습니다.

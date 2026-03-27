# 아키텍처 문서: CX 회의록 & 보고서 자동화 도구

## 시스템 전체 구조

```mermaid
graph TB
    subgraph "사용자 인터페이스 (브라우저)"
        UI[웹 앱 UI]
        NAV[네비게이션]

        subgraph "회의록 모듈"
            REC[음성 녹음]
            STT[음성→텍스트 변환]
            INPUT[텍스트 입력]
            RESULT[정리 결과 표시]
        end

        subgraph "보고서 모듈"
            RSET[보고서 설정]
            RPREV[보고서 미리보기]
            REXPORT[내보내기/다운로드]
        end

        subgraph "CX 지표 모듈"
            CXFORM[지표 입력 폼]
            CXSUM[지표 요약/차트]
        end
    end

    subgraph "브라우저 API"
        WSAPI[Web Speech API]
        IDB[IndexedDB]
    end

    subgraph "외부 서비스"
        AI[AI API<br/>OpenAI / Claude]
    end

    REC --> WSAPI
    WSAPI --> STT
    STT --> INPUT
    INPUT --> AI
    AI --> RESULT

    RSET --> AI
    AI --> RPREV
    RPREV --> REXPORT

    RESULT --> IDB
    CXFORM --> IDB
    IDB --> RSET
    IDB --> CXSUM
```

## 주요 컴포넌트 간 관계

```mermaid
graph LR
    subgraph "페이지"
        P1[회의록 페이지]
        P2[보고서 페이지]
        P3[CX 지표 페이지]
    end

    subgraph "서비스 레이어"
        S1[음성 인식 서비스]
        S2[AI 정리 서비스]
        S3[보고서 생성 서비스]
        S4[데이터 저장 서비스]
    end

    P1 --> S1
    P1 --> S2
    P1 --> S4
    P2 --> S3
    P2 --> S4
    P3 --> S4

    S2 --> S4
    S3 --> S4
```

## 데이터 흐름

```mermaid
sequenceDiagram
    participant U as 사용자
    participant APP as 웹 앱
    participant STT as Web Speech API
    participant AI as AI API
    participant DB as IndexedDB

    Note over U,DB: 회의록 생성 플로우
    U->>APP: 녹음 시작 버튼 클릭
    APP->>STT: 음성 인식 시작
    STT-->>APP: 실시간 텍스트 변환
    APP-->>U: 텍스트 표시
    U->>APP: 녹음 중지 & 정리 요청
    APP->>AI: 회의 텍스트 전송
    AI-->>APP: 구조화된 회의록 반환
    APP-->>U: 정리 결과 표시
    U->>APP: 저장
    APP->>DB: 회의록 저장

    Note over U,DB: 보고서 생성 플로우
    U->>APP: 보고서 생성 요청
    APP->>DB: 기간 내 데이터 조회
    DB-->>APP: 회의록 + CX 지표 데이터
    APP->>AI: 데이터 기반 보고서 생성 요청
    AI-->>APP: 보고서 초안
    APP-->>U: 보고서 미리보기
    U->>APP: 다운로드/복사
```

## 기술 스택 요약

```mermaid
graph TB
    subgraph "프론트엔드"
        HTML[HTML5]
        TW[Tailwind CSS]
        JS[Vanilla JavaScript]
    end

    subgraph "브라우저 내장 API"
        WSA[Web Speech API<br/>음성 인식]
        IDB2[IndexedDB<br/>로컬 데이터 저장]
        CB[Clipboard API<br/>복사 기능]
    end

    subgraph "외부 API"
        OAI[OpenAI API<br/>또는 Claude API]
    end

    subgraph "배포"
        GHP[GitHub Pages<br/>정적 호스팅]
    end

    HTML --> TW
    HTML --> JS
    JS --> WSA
    JS --> IDB2
    JS --> CB
    JS --> OAI
    HTML --> GHP
```

## 파일 구조

```
my-vibe-project/
├── index.html          # 메인 앱 (단일 HTML 파일)
├── README.md           # 프로젝트 소개
├── PRD.md              # 제품 요구사항 문서
├── ideation.md         # 아이디어 문서
├── architecture.md     # 아키텍처 문서 (이 파일)
├── development-plan.md # 개발 계획
├── mockup.html         # UI 목업
└── docs/
    ├── tutorial.md     # 바이브 코딩 튜토리얼
    └── git-manual.md   # 비개발자용 Git 매뉴얼
```

import type {LessonProfile} from './session';
import {SCHOOL_LABELS} from './session';

export interface DemoScenario {
  id: string;
  number: number;
  title: string;
  description: string;
  role: string;
  setting: string;
  conflict: string;
  immediateGoal: string;
  opening: {
    observation: string;
    change: string;
  };
  actions: Array<{
    id: string;
    label: string;
    description: string;
  }>;
}

export function profileLabel(profile: LessonProfile): string {
  if (!profile.schoolLevel || !profile.grade) return '학년 미정';
  return `${SCHOOL_LABELS[profile.schoolLevel]} ${profile.grade}학년`;
}

export function buildDemoScenarios(profile: LessonProfile): DemoScenario[] {
  const unit = profile.unit.trim() || profile.subject || '현재 단원';
  const level = profileLabel(profile);

  return [
    {
      id: 'archive-blackout',
      number: 1,
      title: `${unit} 기록관 정전`,
      description: `정전으로 순서가 흐트러진 전시를 방문단 도착 전에 안전하게 정리해야 합니다.`,
      role: `${level} 신입 기록 복원 담당`,
      setting: '오늘 16:10 · 지역 기록관 임시 전시실',
      conflict: `${unit} 자료의 번호표 두 개가 떨어졌고 비상 전력은 아직 돌아오지 않았습니다.`,
      immediateGoal: '전시를 성급히 고치지 않으면서 가장 먼저 확인할 단서를 정합니다.',
      opening: {
        observation: `비상등 아래에 번호표가 떨어진 ${unit} 자료 두 점, 열린 운송 상자, 마지막 점검표가 보입니다. 자료 표면에는 손댄 흔적이 없지만 바닥의 테이프 자국과 현재 위치가 맞지 않습니다.`,
        change: '복도에서 발전기 도착이 15분 늦어진다는 연락과 함께 방문단 버스가 이미 출발했다는 소식이 들어옵니다.',
      },
      actions: [
        {
          id: 'preserve-scene',
          label: '현장을 그대로 보존한다',
          description: '현재 위치와 표식을 기록하고 이동을 잠시 제한한 뒤 남은 단서를 비교합니다.',
        },
        {
          id: 'collect-accounts',
          label: '사람들의 기억을 따로 모은다',
          description: '마지막 점검에 참여한 사람에게 서로 상의하지 않은 상태로 본 것을 묻습니다.',
        },
        {
          id: 'reopen-safe-route',
          label: '확인된 구역만 먼저 연다',
          description: '근거가 충분한 전시 동선만 임시 개방하고 나머지는 확인 중이라고 표시합니다.',
        },
      ],
    },
    {
      id: 'harbor-handover',
      number: 2,
      title: `${unit} 항구 관측 교대`,
      description: `서로 어긋난 두 기록 때문에 다음 조사팀의 출항 판단이 멈췄습니다.`,
      role: `${level} 관측 기록 연락 담당`,
      setting: '내일 05:40 · 작은 항구 관측소',
      conflict: `${unit}에 관한 자동 기록과 야간 근무자의 수기 기록이 서로 다른 흐름을 보여 줍니다.`,
      immediateGoal: '편리한 기록 하나를 고르는 대신 조사팀이 안전하게 계속 일할 방법을 정합니다.',
      opening: {
        observation: `책상에는 같은 시각이 적힌 ${unit} 자동 기록지와 수기 기록장이 놓여 있습니다. 자동 기록에는 한 구간이 비어 있고, 수기 기록에는 평소와 다른 표시가 세 번 반복됩니다.`,
        change: '무전으로 출항 준비가 끝났으며 10분 안에 관측소의 임시 판단이 필요하다는 요청이 옵니다.',
      },
      actions: [
        {
          id: 'repeat-observation',
          label: '짧은 재관측을 요청한다',
          description: '출항을 잠시 미루고 같은 조건에서 다시 얻을 수 있는 기록을 확보합니다.',
        },
        {
          id: 'trace-record-chain',
          label: '기록이 만들어진 과정을 추적한다',
          description: '장비 상태, 기록 시각, 작성자의 관찰 위치를 차례로 확인합니다.',
        },
        {
          id: 'split-decision',
          label: '되돌릴 수 있는 일부터 진행한다',
          description: '불확실성을 공유하고 위험이 낮은 준비만 계속한 채 최종 출항 판단은 보류합니다.',
        },
      ],
    },
    {
      id: 'broadcast-countdown',
      number: 3,
      title: `${unit} 마을 방송 12분 전`,
      description: `생방송 원고와 화면 자료가 어긋난 상태에서 무엇을 방송할지 결정해야 합니다.`,
      role: `${level} 청소년 방송국 사실 확인 담당`,
      setting: '금요일 18:48 · 마을 방송국 조정실',
      conflict: `${unit} 설명이 원고와 화면 자료에서 다르게 표현되어 있지만 생방송 순서는 이미 시작됐습니다.`,
      immediateGoal: '틀릴 수 있는 내용을 숨기지 않으면서 방송 진행 방법을 선택합니다.',
      opening: {
        observation: `원고의 ${unit} 설명 옆에는 출처 표시가 하나뿐이고, 화면 자료에는 수정 시각이 다른 메모 두 장이 붙어 있습니다. 담당자는 아직 스튜디오에 도착하지 않았습니다.`,
        change: '진행자가 이어폰으로 다음 꼭지를 예정보다 4분 먼저 시작할 수 있다고 알립니다.',
      },
      actions: [
        {
          id: 'open-original',
          label: '원문 자료부터 다시 연다',
          description: '방송 순서를 조정하고 두 표현이 기대는 원문과 작성 시각을 대조합니다.',
        },
        {
          id: 'call-producer',
          label: '제작 과정의 책임자에게 연결한다',
          description: '자료가 바뀐 이유와 마지막 승인 내용을 짧고 구체적으로 확인합니다.',
        },
        {
          id: 'air-with-limits',
          label: '확인된 범위만 방송한다',
          description: '확실한 부분과 아직 확인 중인 부분을 나누어 알리고 후속 정정을 약속합니다.',
        },
      ],
    },
    {
      id: 'museum-delivery',
      number: 4,
      title: `${unit} 박물관 야간 배송`,
      description: `수업 전날 도착한 새 자료가 기존 활동 계획과 맞지 않아 전시 동선을 다시 정해야 합니다.`,
      role: `${level} 박물관 교육 프로그램 보조`,
      setting: '수요일 20:25 · 학교 옆 작은 박물관',
      conflict: `${unit} 수업에 쓰려던 복제품 대신 설명이 다른 자료가 배송됐고 담당 교사는 퇴근했습니다.`,
      immediateGoal: '내일 수업을 취소하지 않으면서 학생에게 무엇을 관찰하게 할지 정합니다.',
      opening: {
        observation: `배송 목록에는 ${unit} 수업용 상자가 체크되어 있지만, 열린 상자 안의 자료 이름과 활동지 제목이 다릅니다. 봉인은 온전하고 안내 카드 한 장만 손글씨로 수정되어 있습니다.`,
        change: '경비실에서 보관실을 닫기까지 20분 남았으며 다른 학교가 아침 첫 시간에 방문한다고 알립니다.',
      },
      actions: [
        {
          id: 'quarantine-material',
          label: '새 자료를 분리 보관한다',
          description: '수정 이력이 확인될 때까지 새 자료를 수업 동선에서 빼고 기존 자료만 준비합니다.',
        },
        {
          id: 'redesign-observation',
          label: '차이를 관찰하는 수업으로 바꾼다',
          description: '두 설명의 차이를 숨기지 않고 학생이 확인 질문을 만들도록 활동을 재구성합니다.',
        },
        {
          id: 'seek-remote-confirmation',
          label: '사진과 목록으로 원격 확인을 구한다',
          description: '담당자에게 필요한 정보만 보내고 자료의 정체와 사용 범위를 확인합니다.',
        },
      ],
    },
    {
      id: 'field-camp-weather',
      number: 5,
      title: `${unit} 현장 캠프 경로 변경`,
      description: `조사 출발 직전 지도와 현장 안내가 어긋나 팀의 이동 경로를 다시 정해야 합니다.`,
      role: `${level} 현장 조사팀 경로 담당`,
      setting: '토요일 08:20 · 산자락 조사 캠프',
      conflict: `${unit} 관찰 지점이 표시된 교실 지도와 현장 표지판의 방향이 다르고 비 예보가 앞당겨졌습니다.`,
      immediateGoal: '관찰 기회를 지키면서도 팀이 되돌아올 수 있는 경로와 중단 기준을 정합니다.',
      opening: {
        observation: `교실 지도에는 ${unit} 관찰 지점까지 한 갈래 길만 있지만 현장에는 새 우회 표지와 닫힌 목책이 보입니다. 흙은 젖어 있고 안내판의 갱신 날짜는 읽기 어렵습니다.`,
        change: '인솔자의 기상 단말에 예상보다 이른 비 알림이 뜨고 후발 팀이 10분 뒤 도착한다는 연락이 옵니다.',
      },
      actions: [
        {
          id: 'recon-short-route',
          label: '가까운 구간만 먼저 확인한다',
          description: '전원이 대기한 상태에서 짧은 가시거리 안의 표지와 노면을 확인합니다.',
        },
        {
          id: 'change-site',
          label: '대체 관찰 지점으로 바꾼다',
          description: '같은 단원을 살필 수 있는 가까운 장소를 찾아 이동 거리를 줄입니다.',
        },
        {
          id: 'pause-and-verify',
          label: '출발을 멈추고 최신 정보를 확인한다',
          description: '현장 관리자와 기상 정보를 대조한 뒤 모두가 이해하는 중단 기준을 세웁니다.',
        },
      ],
    },
  ];
}

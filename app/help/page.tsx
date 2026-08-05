import Image from "next/image";
import Link from "next/link";

type Marker = {
  number: number;
  x: number;
  y: number;
};

function ScreenFigure({
  src,
  alt,
  width,
  height,
  markers = [],
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  markers?: Marker[];
}) {
  return (
    <figure className="help-screen">
      <a href={src} target="_blank" rel="noreferrer" aria-label={`${alt} 크게 보기`}>
        <Image src={src} alt={alt} width={width} height={height} sizes="(max-width: 760px) 100vw, 1100px" />
        {markers.map((marker) => (
          <span
            className="help-marker"
            style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
            aria-hidden="true"
            key={marker.number}
          >
            {marker.number}
          </span>
        ))}
      </a>
      <figcaption>이미지를 누르면 원본 크기로 볼 수 있습니다.</figcaption>
    </figure>
  );
}

const MAIN_ITEMS = [
  ["MML 열기", "왼쪽 위 발바닥의 MML 표시를 누르면 작곡 화면이 열립니다. 연주 화면으로 돌아올 때도 같은 버튼을 누르면 됩니다."],
  ["옥타브 선택", "건반을 두 줄로 설정하면 왼쪽과 오른쪽 옥타브를 따로 선택합니다. 한 줄에서 고른 옥타브는 두 줄로 바꿔도 첫 번째 건반에 그대로 유지됩니다."],
  ["조옮김", "−1과 +1은 반음씩, −5th와 +5th는 완전5도씩 실제 소리와 표시 음을 함께 옮깁니다. 초기화는 선택된 옥타브의 C조로 돌아갑니다."],
  ["키 매핑", "건반 안의 작은 글자는 현재 단축키입니다. 설정에서 왼쪽·오른쪽 건반과 옥타브·조옮김 키를 각각 바꿀 수 있고, 화면의 문자만 숨겨도 키 입력은 계속 동작합니다."],
];

const MML_ITEMS = [
  ["재생과 위치 이동", "재생·정지·녹음과 맨앞·맨뒤·한 마디 이동을 조작합니다. 재생 중에는 피아노롤과 경과 시간이 현재 위치를 따라갑니다."],
  ["트랙과 건반 연결", "L/R로 왼쪽·오른쪽 건반을 연결합니다. 여러 트랙에 같은 건반을 연결하면 동시에 누른 화음을 높은 음 또는 낮은 음 순서로 각 트랙에 나누어 기록합니다."],
  ["피아노롤과 코드 연결", "피아노롤은 음높이와 길이를 확인하는 화면입니다. 노트를 누르면 그 음을 만든 MML 코드가 선택되고 텍스트 편집창이 해당 위치로 이동합니다."],
  ["MML 텍스트 편집", "코드를 직접 붙여넣거나 고칩니다. 텍스트창 위의 최적화·풀어쓰기·복사 버튼으로 선택 트랙의 코드를 정리하고, 일부 코드를 드래그한 뒤 오른쪽 클릭하면 선택한 음표의 길이를 한꺼번에 바꿀 수 있습니다."],
  ["건반으로 MML 입력", "화면 건반·컴퓨터 키보드·터치로 연주한 음을 연결된 트랙에 기록합니다. 누르고 있는 음의 길이는 피아노롤에 실시간으로 표시됩니다."],
  ["옥타브와 조옮김", "작곡 화면에서도 옥타브와 조성을 바꿀 수 있습니다. 화면에 표시된 음이 아니라 실제로 들리는 전조된 음높이가 MML에 기록됩니다."],
];

export default function HelpPage() {
  return (
    <main className="help-page">
      <article className="help-card">
        <header className="help-header">
          <Link className="help-brand" href="/" aria-label="냥냥 연주 화면으로 돌아가기">
            <Image src="/assets/themes/default/pawpad.svg" alt="" width={42} height={42} />
            <strong>냥냥</strong>
          </Link>
          <Link className="help-back" href="/">← 연주 화면으로</Link>
        </header>

        <section className="help-hero">
          <div>
            <span>NYANGNYANG GUIDE</span>
            <h1>냥냥 사용법</h1>
          </div>
          <nav className="help-index" aria-label="도움말 목차">
            <a href="#features">01 · 핵심 기능</a>
            <a href="#play">02 · 건반 연주</a>
            <a href="#mml">03 · MML 편집</a>
            <a href="#record">04 · 녹음</a>
            <a href="#settings">05 · 설정</a>
            <a href="#files">06 · 파일과 호환</a>
          </nav>
        </section>

        <section className="help-quick" aria-labelledby="quick-title">
          <span>소리가 안 나면</span>
          <div>
            <h2 id="quick-title">화면의 건반을 한 번 누르세요.</h2>
            <p>모바일 브라우저는 첫 터치 전까지 소리를 막을 수 있습니다. 첫 건반을 누르면 오디오가 켜집니다.</p>
          </div>
        </section>

        <section className="help-section" id="features">
          <div className="help-section-heading">
            <span>01</span>
            <div><small>KEY FEATURES</small><h2>먼저 알아둘 기능</h2></div>
          </div>
          <div className="help-feature-grid">
            <article>
              <strong>연주를 바로 MML로 기록</strong>
              <p>화면 건반, 컴퓨터 키보드, 멀티터치로 연주하면 음높이와 누른 길이를 MML로 만듭니다. 녹음 중인 음은 손을 떼기 전부터 피아노롤에서 길어지는 모습이 보입니다.</p>
            </article>
            <article>
              <strong>화음을 여러 트랙에 자동 배정</strong>
              <p>한 건반 세트를 여러 트랙의 L 또는 R에 연결할 수 있습니다. 동시에 누른 음은 높은 음 우선·낮은 음 우선 설정에 따라 연결된 트랙으로 나뉩니다. 트랙 수보다 음이 많으면 기록하지 못한 음을 알려줍니다.</p>
            </article>
            <article>
              <strong>피아노롤 노트에서 MML 찾기</strong>
              <p>피아노롤의 노트를 누르면 해당 트랙이 선택되고, 그 노트를 만든 코드가 텍스트 편집창에 바로 선택됩니다. 피아노롤에서 음을 찾고 실제 수정은 정확한 코드 위치에서 할 수 있습니다.</p>
            </article>
            <article>
              <strong>선택한 음표 길이 일괄 변경</strong>
              <p>MML 텍스트 일부를 드래그하고 오른쪽 클릭하면 1분음표부터 32분음표와 점음표까지 한 번에 바꿀 수 있습니다. <kbd>Alt</kbd>+<kbd>,</kbd>는 길게, <kbd>Alt</kbd>+<kbd>.</kbd>는 짧게 바꿉니다.</p>
            </article>
            <article>
              <strong>템포 변화와 맞는 메트로놈</strong>
              <p>재생 위치의 <code>t</code> 코드를 따라 메트로놈 속도가 바뀝니다. 재생 도중 메트로놈을 켜도 다음 박자에 맞춰 시작하며, 실시간 녹음의 준비 박자는 별도 표시로 구분됩니다.</p>
            </article>
            <article>
              <strong>MML 최적화와 풀어쓰기</strong>
              <p><b>최적화</b>는 같은 연주를 유지하며 코드를 짧게 정리합니다. <b>풀어쓰기</b>는 <code>n</code> 코드와 생략된 음가를 음이름과 명시적 길이로 바꿔 수정하기 쉽게 만듭니다.</p>
            </article>
            <article>
              <strong>원하는 위치와 방식으로 녹음</strong>
              <p>현재 재생 위치·곡의 처음·연결 트랙의 빈 끝부분 중 시작점을 고릅니다. 수정은 기존 구간을 덮고, 삽입은 전체 트랙 또는 사용한 트랙만 뒤로 밉니다.</p>
            </article>
            <article>
              <strong>파일을 오가며 작업</strong>
              <p>MML과 마비꼬 MMI를 읽고, MIDI를 불러오거나 내보낼 수 있습니다. 냥 프로젝트 파일은 트랙 이름·색상·음색·연결·박자표 같은 편집 상태까지 함께 보관합니다.</p>
            </article>
          </div>
        </section>

        <section className="help-section" id="play">
          <div className="help-section-heading">
            <span>02</span>
            <div><small>PLAY</small><h2>건반 연주 화면</h2></div>
          </div>
          <ScreenFigure
            src="/help/main-screen.png"
            alt="냥냥 메인 건반 연주 화면"
            width={1440}
            height={900}
            markers={[
              { number: 1, x: 6, y: 6 },
              { number: 2, x: 40, y: 7 },
              { number: 3, x: 79, y: 8 },
              { number: 4, x: 51, y: 81 },
            ]}
          />
          <div className="help-number-grid">
            {MAIN_ITEMS.map(([title, body], index) => (
              <div key={title}><span>{index + 1}</span><div><h3>{title}</h3><p>{body}</p></div></div>
            ))}
          </div>
        </section>

        <section className="help-section" id="mml">
          <div className="help-section-heading">
            <span>03</span>
            <div><small>COMPOSE</small><h2>MML 작곡 화면</h2></div>
          </div>
          <ScreenFigure
            src="/help/mml-screen.png"
            alt="냥냥 MML 작곡과 피아노롤 화면"
            width={1440}
            height={900}
            markers={[
              { number: 1, x: 16, y: 10 },
              { number: 2, x: 7, y: 31 },
              { number: 3, x: 31, y: 40 },
              { number: 4, x: 32, y: 74 },
              { number: 5, x: 79, y: 78 },
              { number: 6, x: 80, y: 10 },
            ]}
          />
          <div className="help-number-grid">
            {MML_ITEMS.map(([title, body], index) => (
              <div key={title}><span>{index + 1}</span><div><h3>{title}</h3><p>{body}</p></div></div>
            ))}
          </div>
          <div className="help-dialog-grid">
            <article>
              <a href="/help/duration-menu-screen.png" target="_blank" rel="noreferrer" aria-label="선택 음가 변경 메뉴 크게 보기">
                <Image src="/help/duration-menu-screen.png" alt="MML 텍스트를 선택한 뒤 연 음가 변경 메뉴" width={520} height={365} sizes="(max-width: 760px) 100vw, 540px" />
              </a>
              <div>
                <span>텍스트 우클릭</span>
                <h3>선택한 음표 길이 변경</h3>
                <p>MML 텍스트에서 바꿀 구간을 드래그하고 오른쪽 클릭하면 음표와 점음표 길이를 한꺼번에 바꿀 수 있습니다. 메뉴 아래에는 길게·짧게 바꾸는 단축키도 표시됩니다.</p>
              </div>
            </article>
            <article>
              <a href="/help/tempo-dialog-screen.png" target="_blank" rel="noreferrer" aria-label="박자와 템포 변경창 크게 보기">
                <Image src="/help/tempo-dialog-screen.png" alt="피아노롤의 박자와 템포 변경창" width={520} height={370} sizes="(max-width: 760px) 100vw, 540px" />
              </a>
              <div>
                <span>피아노롤 우클릭</span>
                <h3>곡 중간의 템포·박자 변경</h3>
                <p>피아노롤에서 바꿀 위치를 오른쪽 클릭해 템포와 박자표를 추가합니다. 기존 변경 지점도 이 창에 모여 있어 선택한 코드를 수정하거나 삭제할 수 있습니다.</p>
              </div>
            </article>
          </div>
          <div className="help-action-grid">
            <article>
              <span>피아노롤 확대</span>
              <p>오른쪽 위의 가로·세로 −/＋로 시간축과 음정 간격을 따로 조절합니다. 마우스에서는 <kbd>Alt</kbd>+휠이 시간축, <kbd>Alt</kbd>+<kbd>Shift</kbd>+휠이 음정 간격입니다.</p>
            </article>
            <article>
              <span>트랙 빠른 조작</span>
              <p>트랙을 두 번 누르면 이름·색상·음색·음량 설정이 열립니다. L/R은 건반 연결, M은 뮤트, S는 솔로, 눈 아이콘은 피아노롤 표시 여부입니다.</p>
            </article>
            <article>
              <span>여러 트랙 함께 변경</span>
              <p>트랙 왼쪽의 색상 체크박스로 여러 트랙을 고른 뒤 음색을 한꺼번에 바꿀 수 있습니다. 전체 선택과 선택 해제도 같은 영역에서 사용합니다.</p>
            </article>
            <article>
              <span>작곡 화면 크게 보기</span>
              <p>제목줄 오른쪽의 네 모서리 아이콘을 누르면 작곡 화면이 건반 영역까지 넓어집니다. 화면 건반은 가려져도 컴퓨터 키보드 입력은 계속 사용할 수 있습니다.</p>
            </article>
          </div>
        </section>

        <section className="help-section" id="record">
          <div className="help-section-heading">
            <span>04</span>
            <div><small>RECORD</small><h2>두 가지 녹음 방식</h2></div>
          </div>
          <article className="help-recording-settings-guide">
            <a href="/help/recording-settings-screen.png" target="_blank" rel="noreferrer" aria-label="녹음 설정 화면 크게 보기">
              <Image src="/help/recording-settings-screen.png" alt="MML 화면 위쪽의 녹음 설정 버튼과 열린 설정창" width={675} height={400} sizes="(max-width: 760px) 100vw, 620px" />
            </a>
            <div>
              <span>MML 화면 위쪽 ⚙</span>
              <h3>녹음 방식은 ‘녹음 설정’에서 바꿉니다</h3>
              <p>MML 화면 위쪽의 톱니바퀴 버튼을 누르고 첫 번째 <b>녹음 방식</b>에서 실시간 또는 이어붙이기를 고릅니다. 시작 위치·수정/삽입·박자 보정·음 배정·트랙 템포·카운트인과 단축키도 같은 창에 있습니다.</p>
            </div>
          </article>
          <div className="help-mode-grid">
            <article>
              <span>실시간</span>
              <h3>시간이 계속 흐르는 녹음</h3>
              <p>템포와 재생 위치를 기준으로 누른 시각과 길이를 기록합니다. 비어 있는 시간은 쉼표가 됩니다. 카운트인을 0·1·2마디로 정할 수 있고 메트로놈은 곡의 템포 변화를 따라갑니다.</p>
            </article>
            <article>
              <span>이어붙이기</span>
              <h3>연주한 음만 차례로 붙이기</h3>
              <p>손을 떼고 기다린 시간은 버리고, 보정된 음의 끝으로 재생 위치를 옮겨 다음 음을 바로 붙입니다. 쉼표가 필요할 때만 화면의 쉼표 건반이나 설정한 쉼표 키를 길게 누릅니다.</p>
            </article>
          </div>
          <article className="help-rest-guide">
            <a href="/help/rest-button-screen.png" target="_blank" rel="noreferrer" aria-label="쉼표 건반 크게 보기">
              <Image src="/help/rest-button-screen.png" alt="검은 건반 자리에 놓인 쉼표 건반" width={545} height={295} sizes="(max-width: 760px) 100vw, 520px" />
            </a>
            <div>
              <span>이어붙이기 녹음</span>
              <h3>쉼표 건반</h3>
              <p>검은 건반 사이의 쉼표 버튼을 누른 길이만큼 <code>r</code>을 기록합니다. 기본 단축키는 <kbd>S</kbd>이며, 다른 음과 마찬가지로 녹음 설정의 음가 보정이 적용됩니다.</p>
            </div>
          </article>
          <div className="help-note">
            <strong>음가 보정</strong>
            <p>1/1·1/2·1/4·1/8·1/16·1/32는 누른 길이를 가장 가까운 음가로 정리합니다. 자동 리듬 인식은 셋잇단을 포함한 여러 후보 중 실제 길이에 가장 가까운 조합을 고르고, 보정 안 함은 연주 길이를 그대로 기록합니다.</p>
          </div>
          <div className="help-action-grid">
            <article><span>녹음 시작</span><p>녹음 설정을 닫고 위쪽의 원 모양 녹음 버튼을 누릅니다. 기본 단축키는 <kbd>Alt</kbd>+<kbd>R</kbd>이며, 연주를 마치면 정지 버튼으로 기록을 끝냅니다.</p></article>
            <article><span>메트로놈은 별도 조작</span><p>음표 모양 메트로놈 버튼은 녹음 버튼과 따로 켜고 끕니다. 실시간 녹음에서는 카운트인 뒤 곡 위치와 동기화되고, 이어붙이기에서는 필요할 때만 소리를 켭니다.</p></article>
            <article><span>녹음 시작 위치</span><p><b>현재 재생 위치</b>, <b>처음부터</b>, <b>연결 트랙의 빈 끝부분</b> 중에서 고릅니다. 트랙을 바꿔 이어 녹음할 때 빈 끝부분이 유용합니다.</p></article>
            <article><span>수정과 삽입</span><p><b>수정</b>은 실제로 기록한 트랙과 구간만 덮어씁니다. <b>삽입</b>은 녹음 길이만큼 기존 내용을 뒤로 밀며 전체 트랙 또는 사용 트랙만 밀 수 있습니다.</p></article>
            <article><span>화음 배정</span><p>같은 L/R에 연결된 트랙 수만큼 음을 기록합니다. 높은 음 우선이면 가장 높은 음부터 Track 1, Track 2 순으로 배정하고 낮은 음 우선은 반대로 배정합니다.</p></article>
            <article><span>반복 구간</span><p>녹음 설정에서 시작 마디와 끝 마디를 정한 뒤 반복 버튼을 켭니다. 기본 반복 범위는 한 마디가 아니라 곡의 전체 길이입니다.</p></article>
          </div>
        </section>

        <section className="help-section help-settings-section" id="settings">
          <div className="help-section-heading">
            <span>05</span>
            <div><small>SETTINGS</small><h2>연주 설정</h2></div>
          </div>
          <div className="help-settings-layout">
            <a className="help-settings-image" href="/help/settings-screen.png" target="_blank" rel="noreferrer" aria-label="연주 설정 화면 크게 보기">
              <Image src="/help/settings-screen.png" alt="냥냥 연주 설정 화면" width={1114} height={1662} sizes="(max-width: 760px) 88vw, 430px" />
              <span>눌러서 크게 보기</span>
            </a>
            <div className="help-settings-list">
              <div><span>01</span><h3>건반과 옥타브</h3><p>한 줄·두 줄 건반, 모바일 가로 표시, 낮은 B와 높은 C, 각 옥타브 선택 버튼을 설정합니다.</p></div>
              <div><span>02</span><h3>건반 표시</h3><p>음이름의 샵·플랫 표기, 실제 전조 음 표시, 단축키 문자 표시를 바꿉니다.</p></div>
              <div><span>03</span><h3>소리와 음색</h3><p>전체 음량과 기본 음색을 고르고, 기기에 있는 ZIP·DLS 사운드팩을 불러옵니다.</p></div>
              <div><span>04</span><h3>키 매핑</h3><p>왼쪽·오른쪽 건반, 옥타브 F1–F8, 반음·완전5도 조옮김과 초기화 키를 각각 바꿉니다. 매핑 문자 표시를 켜면 현재 키가 건반과 조작 버튼 안에 보입니다.</p></div>
            </div>
          </div>
        </section>

        <section className="help-section" id="files">
          <div className="help-section-heading">
            <span>06</span>
            <div><small>FILES</small><h2>파일과 호환</h2></div>
          </div>
          <div className="help-file-grid">
            <div><strong>MML</strong><p><code>MML@</code> 전체 코드를 텍스트창에 붙여넣으면 파트를 인식해 트랙으로 나눕니다. 파일 불러오기에서는 일반 MML과 3MLE 채널 파일을 열고, 전체 교체·곡 뒤에 이어 붙이기·새 트랙 추가·선택 트랙 교체를 고릅니다.</p></div>
            <div><strong>MMI</strong><p>마비꼬의 <code>.mmi</code> 파일에서 곡 제목, 박자표와 여러 MML 트랙을 읽습니다.</p></div>
            <div><strong>MIDI</strong><p>표준 MIDI 파일을 트랙으로 불러오거나 현재 곡을 MIDI 파일로 내보냅니다.</p></div>
            <div><strong>냥 프로젝트</strong><p>트랙 이름·색상·음색·박자표와 편집 상태를 함께 저장했다가 냥냥에서 다시 이어서 작업합니다.</p></div>
          </div>
          <div className="help-action-grid">
            <article><span>호환성 검사</span><p>문법 오류와 서로 충돌하는 템포를 확인합니다. 오류가 있으면 재생·녹음 전에 문제가 생긴 코드 위치를 알려줍니다.</p></article>
            <article><span>자동 저장</span><p>마지막으로 편집한 냥 프로젝트는 이 기기의 브라우저에 자동 저장됩니다. 별도 백업이나 다른 기기로 이동할 때는 냥 프로젝트 파일로 저장하세요.</p></article>
            <article><span>MML 내보내기</span><p>편집용 주석은 빼고 여러 트랙을 하나의 <code>MML@…;</code> 코드로 저장합니다. 전체 MML 복사는 같은 결과를 클립보드에 넣습니다.</p></article>
            <article><span>사운드팩</span><p>설정에서 사용자가 가진 DLS·ZIP 사운드팩을 추가합니다. 파일은 서버로 보내지 않고 기기 안에서 읽으며, 여러 트랙을 선택해 음색을 한꺼번에 바꿀 수 있습니다.</p></article>
          </div>
          <div className="help-note">
            <strong>파일 메뉴 위치</strong>
            <p>MML 화면 위쪽의 점 세 개(…)를 누르면 불러오기, MIDI·MML 내보내기, 전체 MML 복사와 프로젝트 저장 메뉴가 열립니다.</p>
          </div>
        </section>

        <section className="help-shortcuts" aria-labelledby="shortcut-title">
          <div><small>SHORTCUTS</small><h2 id="shortcut-title">기본 단축키</h2></div>
          <dl>
            <div><dt>건반</dt><dd>화면 건반 안의 문자</dd></div>
            <div><dt>옥타브</dt><dd>F1 – F8</dd></div>
            <div><dt>반음</dt><dd>− / =</dd></div>
            <div><dt>완전5도</dt><dd>[ / ]</dd></div>
            <div><dt>조 초기화</dt><dd>\</dd></div>
            <div><dt>MML 열기</dt><dd>Alt + M</dd></div>
            <div><dt>MML 재생</dt><dd>Space</dd></div>
            <div><dt>MML 녹음</dt><dd>Alt + R</dd></div>
          </dl>
          <p>대부분의 연주·녹음 단축키는 설정에서 바꿀 수 있습니다.</p>
        </section>

        <footer className="help-footer">
          <span>NYANGNYANG</span>
          <div><Link href="/privacy">개인정보처리방침</Link><Link href="/">건반으로 돌아가기</Link></div>
        </footer>
      </article>
    </main>
  );
}

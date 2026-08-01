import Image from "next/image";
import Link from "next/link";

const EFFECTIVE_DATE = "2026년 8월 1일";

export default function PrivacyPage() {
  return (
    <main className="privacy-page">
      <article className="privacy-card">
        <header className="privacy-header">
          <Link className="privacy-brand" href="/" aria-label="냥냥 건반으로 돌아가기">
            <Image src="/assets/themes/default/pawpad.svg" alt="" width={39} height={39} />
            <strong>냥냥</strong>
          </Link>
          <Link className="privacy-back" href="/">← 건반으로 돌아가기</Link>
        </header>

        <div className="privacy-title">
          <span>PRIVACY</span>
          <h1>개인정보처리방침</h1>
          <p>시행일 {EFFECTIVE_DATE}</p>
        </div>

        <section className="privacy-summary" aria-label="핵심 요약">
          <strong>한눈에 보기</strong>
          <p>냥냥은 회원가입, 광고 추적, 방문자 분석 기능을 사용하지 않습니다. 마이크 소리는 기기 안에서만 실시간으로 처리하며 녹음하거나 전송하지 않습니다.</p>
        </section>

        <div className="privacy-sections">
          <section>
            <span>01</span>
            <div>
              <h2>직접 수집하는 정보</h2>
              <p>냥냥은 이름, 이메일, 전화번호, 계정 정보와 같은 개인정보를 직접 입력받거나 저장하지 않습니다. 자체 쿠키와 맞춤형 광고 또는 방문자 분석 도구도 사용하지 않습니다.</p>
            </div>
          </section>

          <section>
            <span>02</span>
            <div>
              <h2>기기에 저장되는 설정</h2>
              <p>옥타브 버튼, 건반 수, 키 매핑, 표시 방식, 음색, 음량과 마이크 감도 등의 설정은 브라우저의 로컬 저장소에만 보관됩니다. 이 정보는 서버로 전송되지 않으며, 설정의 ‘초기화’ 버튼이나 브라우저의 사이트 데이터 삭제 기능으로 지울 수 있습니다.</p>
            </div>
          </section>

          <section>
            <span>03</span>
            <div>
              <h2>마이크 권한과 소리 처리</h2>
              <p>‘불어서 연주’를 켠 경우에만 브라우저가 마이크 권한을 요청합니다. 마이크 입력은 부는 세기에 따라 음량을 조절하기 위한 크기 값으로 기기 안에서 실시간 계산됩니다.</p>
              <ul>
                <li>마이크 소리를 녹음하거나 파일로 저장하지 않습니다.</li>
                <li>음성 또는 마이크 데이터를 서버나 제3자에게 전송하지 않습니다.</li>
                <li>음높이, 대화 내용 또는 개인의 음성을 분석하지 않습니다.</li>
                <li>기능을 끄거나 페이지를 닫으면 마이크 사용을 중지합니다.</li>
              </ul>
            </div>
          </section>

          <section>
            <span>04</span>
            <div>
              <h2>호스팅 과정의 기술 정보</h2>
              <p>사이트 제공과 보안을 위해 호스팅 사업자인 Cloudflare가 접속 IP, 브라우저·기기 정보, 요청 시각 같은 일반적인 접속 기록을 처리할 수 있습니다. 냥냥은 이 정보를 광고, 이용자 프로파일링 또는 개인정보 판매에 사용하지 않습니다.</p>
              <p><a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer">Cloudflare 개인정보처리방침 ↗</a></p>
            </div>
          </section>

          <section>
            <span>05</span>
            <div>
              <h2>보유 기간과 이용자의 선택</h2>
              <p>냥냥이 별도로 보유하는 개인정보는 없습니다. 기기에 저장된 설정은 이용자가 삭제할 때까지 남을 수 있습니다. 마이크 권한은 브라우저나 운영체제 설정에서 언제든 취소할 수 있으며, 권한을 허용하지 않아도 불어서 연주를 제외한 건반 기능은 사용할 수 있습니다.</p>
            </div>
          </section>

          <section>
            <span>06</span>
            <div>
              <h2>문의와 방침 변경</h2>
              <p>개인정보 처리와 관련된 문의는 아래 이메일로 보내주세요. 방침의 내용이 달라지면 이 페이지의 시행일과 함께 변경 사항을 알립니다.</p>
              <p><a href="mailto:chaamu.channel@gmail.com">chaamu.channel@gmail.com</a></p>
            </div>
          </section>
        </div>

        <footer className="privacy-footer">
          <span>NYANGNYANG</span>
          <Link href="/">연주 화면으로 돌아가기</Link>
        </footer>
      </article>
    </main>
  );
}

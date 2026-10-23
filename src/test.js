// 연금저축·IRP 세액공제 엔진 시험 — 기대값은 소득세법 제59조의3(2026-01-01 시행본)으로 손계산한 값.
// 공용 제도 상수(rules.js)는 페이지의 <script src>에서 버전을 읽어, 위쪽 폴더의 허브 clone → 없으면 고정 주소 순으로 찾는다.
(function loadRules() {
  const fs = require('fs'), path = require('path');
  const page = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');
  const rel = page.match(/rules\/v[\d.]+\/rules\.js/)[0];
  let src = null;
  for (let d = __dirname, i = 0; i < 6 && src === null; i++, d = path.dirname(d)) {
    const f = path.join(d, 'ttokjaetv.github.io', rel);
    if (fs.existsSync(f)) src = fs.readFileSync(f, 'utf8');
  }
  if (src === null) src = require('child_process').execFileSync(process.execPath, ['-e',
    `fetch('https://ttokjaetv.github.io/${rel}').then(r => { if (!r.ok) throw new Error(r.status); return r.text(); }).then(t => process.stdout.write(t))`]).toString();
  const m = { exports: {} };
  new Function('module', 'exports', src)(m, m.exports);
  global.TTOKJAE_RULES = m.exports;
})();
const R = global.TTOKJAE_RULES;
const { pcCalc, pcCurve } = require('./engine.js');
const M = 1e4;
let fail = 0, n = 0;
const eq = (name, got, want) => { n++; if (got !== want) { fail++; console.log(`✗ ${name}: ${got} (기대 ${want})`); } };
const W = (o) => pcCalc({ kind: 'wage', income: 5000 * M, ps: 0, irp: 0, isa: 0, isaTo: 'ps', isaPrev: 0, tax: null, ...o }, R);

// 1. 총급여 5,000만 · 연금저축 300만 → 300만 × 15% = 45만 + 지방세 4.5만
let r = W({ ps: 300 * M });
eq('기본 국세', r.national, 450000); eq('기본 지방세', r.local, 45000); eq('기본 합계', r.total, 495000);
eq('남은 한도', r.roomAny, 600 * M); eq('연금저축으로 넣을 수 있는 몫', r.roomPs, 300 * M);

// 2. 총급여 6,000만 · 연금저축 800만 + IRP 200만 → 연금저축 600만 + IRP 200만 = 800만 × 12% = 96만 + 9.6만
r = W({ income: 6000 * M, ps: 800 * M, irp: 200 * M });
eq('연금저축 600만 한도', r.psCounted, 600 * M); eq('공제 대상', r.base, 800 * M); eq('13.2% 합계', r.total, 1056000);
eq('넘친 몫', r.over, 200 * M); eq('IRP로 더 넣을 수 있는 몫', r.roomAny, 100 * M); eq('연금저축은 더 못 넣음', r.roomPs, 0);

// 3. 연금저축 600 + IRP 600 → 900만 한도 → 135만 + 13.5만, 300만은 세액공제 받지 않은 원금
r = W({ ps: 600 * M, irp: 600 * M });
eq('900만 한도', r.base, 900 * M); eq('900만 합계', r.total, 1485000); eq('900만 넘친 몫', r.over, 300 * M);

// 4. ISA 만기 3,000만 → 연금저축 (다른 납입 없음): 연금저축 600만 + 추가 300만 = 900만
r = W({ isa: 3000 * M, isaTo: 'ps' });
eq('ISA→연금저축 추가', r.extra, 300 * M); eq('ISA→연금저축 공제 대상', r.base, 900 * M);

// 5. ISA 3,000만 → IRP, 연금저축 600 + IRP 300 → 900 + 300 = 1,200만 → 180만 + 18만
r = W({ ps: 600 * M, irp: 300 * M, isa: 3000 * M, isaTo: 'irp' });
eq('1,200만', r.base, 1200 * M); eq('1,200만 합계', r.total, 1980000);

// 6. ISA 5,000만 → 10% = 500만이지만 300만 한도, 작년에 200만 썼으면 100만
eq('추가 300만 한도', W({ irp: 900 * M, isa: 5000 * M, isaTo: 'irp' }).extra, 300 * M);
eq('두 해에 걸친 전환', W({ irp: 900 * M, isa: 5000 * M, isaTo: 'irp', isaPrev: 200 * M }).extra, 100 * M);
eq('ISA 1,000만 → 100만', W({ irp: 900 * M, isa: 1000 * M, isaTo: 'irp' }).extra, 100 * M);

// 7. 결정세액 50만이면 공제는 50만까지 (+ 지방세 5만), 85만은 못 돌려받음
r = W({ ps: 600 * M, irp: 300 * M, tax: 50 * M });
eq('결정세액 한도 국세', r.national, 500000); eq('결정세액 한도 합계', r.total, 550000); eq('못 받는 몫', r.lostByTax, 850000);
eq('결정세액 0', W({ ps: 600 * M, tax: 0 }).total, 0);

// 8. 소득 기준: 총급여 5,500만 이하 16.5%, 종합소득금액 4,500만 이하 16.5%
eq('총급여 5,500만', W({ income: 5500 * M, ps: 100 * M }).rate.high, true);
eq('총급여 5,500만 + 1원', W({ income: 5500 * M + 1, ps: 100 * M }).rate.high, false);
eq('종합소득 4,500만', W({ kind: 'comp', income: 4500 * M, ps: 100 * M }).rate.high, true);
eq('종합소득 4,500만 + 1원', W({ kind: 'comp', income: 4500 * M + 1, ps: 100 * M }).rate.high, false);
eq('12% 국세', W({ income: 9000 * M, ps: 100 * M }).national, 120000);

// 9. 연 1,800만 납입한도 넘김 (ISA 전환분 별도)
eq('1,800만 초과', W({ ps: 1000 * M, irp: 900 * M }).yearLimitOver, 100 * M);
eq('ISA 전환분은 별도', W({ ps: 900 * M, irp: 900 * M, isa: 3000 * M }).yearLimitOver, 0);

// 10. 차트 곡선: 0 → 600만에서 기울기, 900만에서 평평
const c = pcCurve({ kind: 'wage', income: 5000 * M, isa: 0 }, R, 1200 * M, 100 * M);
eq('곡선 900만', c[9].total, 1485000); eq('곡선 1,200만 = 900만', c[12].total, 1485000);

console.log(fail ? `실패 ${fail}/${n}` : `ALL PASS (${n}개)`);
process.exit(fail ? 1 : 0);

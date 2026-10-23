/* 연금저축·IRP 세액공제 계산 엔진 — 소득세법 제59조의3 (2026-01-01 시행본)
 * 금액은 원. 제도 숫자는 모두 rules.js(TTOKJAE_RULES)에서 읽는다.
 *
 * pcCalc(inp, R)
 *   inp = { kind: 'wage' | 'comp',   // 근로소득만(총급여 기준) | 그 밖(종합소득금액 기준)
 *           income,                    // 총급여 또는 종합소득금액
 *           ps, irp,                   // 올해 본인이 넣은(넣을) 연금저축·IRP 납입액 (퇴직금 입금·계좌 이전 제외)
 *           isa, isaTo: 'ps' | 'irp',  // 올해 ISA 만기 전환금액과 옮긴 계좌
 *           isaPrev,                   // 같은 전환으로 작년에 이미 쓴 추가 공제 대상액 (두 해에 걸쳐 옮긴 경우)
 *           tax }                      // (선택) 연금계좌 세액공제 전 결정세액(국세). 없으면 null
 *
 * 공제 대상 납입액 = min( 연금저축(600만 한도) + IRP 의 900만 한도  +  ISA 전환금액의 10%(300만 − 작년분 한도),
 *                       연금저축 + IRP 전체 납입액 )                         — 제59조의3①·③·④
 * 세액공제(국세) = 공제 대상 × 12%(소득 기준 이하 15%), 결정세액이 있으면 그 안에서만. 지방소득세는 국세의 10%.
 */
function pcRate(kind, income, R) {
  const P = R.PENSION_SAVINGS;
  const limit = kind === 'comp' ? P.creditRateComprehensiveLimit : P.creditRateWageLimit;
  const high = income <= limit;
  const total = high ? P.creditRateHigh : P.creditRateLow;            // 지방세 포함 16.5% · 13.2%
  const national = Math.round(total / (1 + R.INCOME_TAX.local) * 1e6) / 1e6;   // 15% · 12%
  return { high, total, national, limit };
}

function pcCalc(inp, R) {
  const P = R.PENSION_SAVINGS, local = R.INCOME_TAX.local;
  const n = v => Math.max(0, +v || 0);
  const ps = n(inp.ps), irp = n(inp.irp), isa = n(inp.isa), isaPrev = n(inp.isaPrev);
  const toPs = inp.isaTo !== 'irp';
  const rate = pcRate(inp.kind === 'comp' ? 'comp' : 'wage', n(inp.income), R);

  const psAll = ps + (toPs ? isa : 0), irpAll = irp + (toPs ? 0 : isa);
  const paid = psAll + irpAll;
  const psCounted = Math.min(psAll, P.creditLimitPensionSavings);
  const normal = Math.min(psCounted + irpAll, P.creditLimitTotal);          // 제59조의3① 단서
  const extraCap = Math.max(0, P.isaTransferCreditCap - isaPrev);
  const extra = isa > 0 ? Math.min(isa * P.isaTransferCreditRate, extraCap) : 0;   // 제59조의3④
  const cap = normal + extra;
  const base = Math.min(paid, cap);

  const fullNational = Math.floor(base * rate.national);
  const hasTax = inp.tax != null && inp.tax !== '' && isFinite(+inp.tax);
  const tax = hasTax ? n(inp.tax) : null;
  const national = hasTax ? Math.min(fullNational, tax) : fullNational;
  const localAmt = Math.floor(national * local);
  const total = national + localAmt;

  // 한도까지 남은 금액 (본인 납입 기준). 연금저축은 600만 안에서만, IRP는 900만까지
  const limit = P.creditLimitTotal + extra;                                  // 올해 최대 공제 한도 (900만 + ISA 추가)
  const roomAny = Math.max(0, limit - base);
  const roomPs = Math.max(0, Math.min(P.creditLimitPensionSavings - psCounted, P.creditLimitTotal - normal));
  const over = Math.max(0, paid - base);                                     // 세액공제 받지 않은 원금이 되는 몫
  const yearLimitOver = Math.max(0, ps + irp - P.contributionLimit);          // 연 1,800만 납입한도 초과 (ISA 전환분 별도)
  const lostByTax = fullNational - national;

  return { rate, ps, irp, isa, toPs, psAll, irpAll, paid, psCounted, normal, extra, extraCap, cap, limit, base,
    fullNational, national, local: localAmt, total, tax, lostByTax,
    roomAny, roomPs, over, yearLimitOver };
}

/* 넣는 돈을 늘려 가며 환급액이 어떻게 바뀌는지 (연금저축을 먼저 600만까지, 그다음 IRP) — 차트용 */
function pcCurve(inp, R, maxPaid, step) {
  const P = R.PENSION_SAVINGS, pts = [];
  for (let x = 0; x <= maxPaid + 1e-9; x += step) {
    const ps = Math.min(x, P.creditLimitPensionSavings), irp = x - ps;
    pts.push({ x, total: pcCalc({ ...inp, ps, irp }, R).total });
  }
  return pts;
}

if (typeof module !== 'undefined') module.exports = { pcCalc, pcRate, pcCurve };

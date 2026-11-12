/** 本机轻量存储：记住最近一次查询过的患者编号，便于导航跳转 */

const LAST_PATIENT_KEY = 'evp.last.patientId'

export function setLastPatientId(patientId: string): void {
  try {
    window.localStorage.setItem(LAST_PATIENT_KEY, patientId)
  } catch {
    // 忽略存储异常
  }
}

export function getLastPatientId(): string {
  try {
    return window.localStorage.getItem(LAST_PATIENT_KEY) || ''
  } catch {
    return ''
  }
}

/* BreastTrack — Service Worker (v2.0-beta)
   ทำให้เปิดแอปได้แม้ไม่มีอินเทอร์เน็ต (เช่น เน็ตหลุดในห้องตรวจ)

   หลักการสำคัญ:
   - ตัวแอป (index.html) และไลบรารีภายนอก → เก็บแคชไว้ให้เปิดได้ตอนออฟไลน์
   - ข้อมูลผู้ป่วย (Firestore) → ไม่แตะเลย ปล่อยให้ Firebase SDK จัดการเอง
     เพราะ Firestore มีระบบ offline ของตัวเองใน IndexedDB อยู่แล้ว
     ถ้า SW ไปแคชคำขอเหล่านี้จะทำให้เห็นข้อมูลเก่าค้างและซิงก์เพี้ยน
*/
const CACHE = 'breasttrack-v2.0-beta';
const CORE = ['./', './index.html'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(CORE).catch(() => {})).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* โดเมนที่ต้องผ่านตรงไปหา network เสมอ — ห้ามแคชเด็ดขาด */
function isLiveData(url) {
  return /firestore\.googleapis\.com|firebaseio\.com|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|googleapis\.com\/google\.firestore/.test(url);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = req.url;

  /* ข้อมูลสดของ Firebase — ไม่ยุ่ง ปล่อยผ่าน */
  if (req.method !== 'GET' || isLiveData(url)) return;

  /* หน้าเว็บหลัก: เอาของใหม่ก่อน ถ้าไม่มีเน็ตค่อยใช้ของที่เคยเก็บไว้ */
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match('./index.html').then(r => r || caches.match('./')))
    );
    return;
  }

  /* ไฟล์ประกอบ (Firebase SDK, xlsx ฯลฯ): ใช้ของที่แคชไว้ก่อน เร็วกว่าและใช้ได้ตอนออฟไลน์ */
  e.respondWith(
    caches.match(req).then(cached => {
      const net = fetch(req)
        .then(res => {
          if (res && res.ok && (res.type === 'basic' || res.type === 'cors')) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);
      return cached || net;
    })
  );
});

// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.

export default function CameraCaptureTab() {
  return (
    <div style={{ flex: 1, width: '100%', height: '100%', border: 'none', background: '#0b0b12', display: 'flex' }}>
      <iframe
        src="../Czur-Fast-Capture/index.html"
        title="CZUR Fast Capture Point"
        style={{ width: '100%', height: '100%', border: 'none', flex: 1 }}
      />
    </div>
  );
}

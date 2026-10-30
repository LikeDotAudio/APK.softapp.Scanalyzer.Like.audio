// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
import { useState } from 'react';
import { getCloudShare, setCloudShare } from '../../cloudShare';

/** The opt-in shown before a scan starts. Unticked, nothing leaves the machine. */
export default function CloudShareToggle() {
  const [on, setOn] = useState(getCloudShare);
  return (
    <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)', cursor: 'pointer' }}
      title="Off by default. On, each analysed record (not the audio) is sent to the shared database at scanalyzer.like.audio.">
      <input type="checkbox" checked={on}
        onChange={(e) => { setCloudShare(e.target.checked); setOn(e.target.checked); }} />
      Contribute the analysis (not the audio) to the shared cloud database
    </label>
  );
}

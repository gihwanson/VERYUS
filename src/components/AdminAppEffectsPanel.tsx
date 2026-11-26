import React, { useEffect, useState } from 'react';
import { Snowflake } from 'lucide-react';
import { setSnowEnabled, subscribeSnowEnabled, type AppEffectsActor } from '../utils/appEffects';

type AdminAppEffectsPanelProps = {
  actor: AppEffectsActor | null;
};

const AdminAppEffectsPanel: React.FC<AdminAppEffectsPanelProps> = ({ actor }) => {
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    return subscribeSnowEnabled((next) => {
      setEnabled(next);
      setReady(true);
    });
  }, []);

  const handleToggle = async () => {
    if (!ready || saving) return;
    const next = !enabled;
    setSaving(true);
    setError('');
    setEnabled(next);
    try {
      await setSnowEnabled(next, actor);
    } catch (toggleError) {
      console.error('눈 내리기 저장 실패:', toggleError);
      setEnabled(!next);
      setError('저장하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="admin-effects" aria-labelledby="admin-effects-title">
      <header className="admin-effects-header">
        <h2 id="admin-effects-title">앱 효과</h2>
        <p>스위치를 켜면 앱을 쓰는 모든 화면에 바로 적용됩니다.</p>
      </header>

      <div className="admin-effects-card">
        <div className="admin-effects-copy">
          <Snowflake size={22} aria-hidden />
          <div>
            <div className="admin-effects-title">눈 내리기</div>
            <p>화면 위에 눈이 내립니다. 버튼과 입력은 그대로 누를 수 있습니다.</p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="눈 내리기"
          className={`admin-effects-switch${enabled ? ' active' : ''}`}
          onClick={() => void handleToggle()}
          disabled={!ready || saving}
        >
          <span className="admin-effects-switch-knob" />
        </button>
      </div>

      <p className="admin-effects-status" role="status">
        {saving ? '적용하는 중...' : enabled ? '눈이 내리고 있습니다.' : '눈 내리기가 꺼져 있습니다.'}
      </p>
      {error && <p className="admin-effects-error">{error}</p>}
    </section>
  );
};

export default AdminAppEffectsPanel;

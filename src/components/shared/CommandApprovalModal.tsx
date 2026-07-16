import { useState, useEffect, useRef } from 'react';
import { Terminal, ShieldCheck, ShieldAlert, Play, Ban } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { useCommandApprovalStore } from '@/store/useCommandApprovalStore';
import './CommandApprovalModal.css';

/**
 * Popup shown the first time the agent tries to run a shell command. Gives the
 * user a clear, low-friction choice: run just this command, trust every command
 * for the rest of the session, or reject and (optionally) redirect the agent.
 */
export function CommandApprovalModal() {
  const pending = useCommandApprovalStore((s) => s.pending);
  const resolve = useCommandApprovalStore((s) => s.resolve);
  const [instruction, setInstruction] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (pending) setInstruction('');
  }, [pending]);

  if (!pending) return null;

  const allowOnce = () => resolve({ decision: 'allow-once' });
  const allowSession = () => resolve({ decision: 'allow-session' });
  const reject = () => resolve({ decision: 'reject', instruction: instruction.trim() || undefined });

  return (
    <Modal
      isOpen
      onClose={reject}
      title="Agent wants to run a command"
      size="md"
    >
      <div className="cmd-approval">
        <p className="cmd-approval__lead">
          The agent is about to execute the following command in your workspace.
          Review it before it runs.
        </p>

        <div className="cmd-approval__command">
          <span className="cmd-approval__command-icon" aria-hidden="true">
            <Terminal size={13} />
          </span>
          <pre className="cmd-approval__command-text">{pending.command}</pre>
        </div>

        <label className="cmd-approval__instruct-label" htmlFor="cmd-instruct">
          Tell the agent what to do instead{' '}
          <span className="cmd-approval__instruct-optional">(optional — used if you reject)</span>
        </label>
        <textarea
          id="cmd-instruct"
          ref={textareaRef}
          className="cmd-approval__instruct"
          rows={3}
          placeholder="e.g. run it with --dry-run first, or use the test database instead"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
        />

        <div className="cmd-approval__actions">
          <Button
            variant="ghost"
            icon={<Ban size={14} />}
            onClick={reject}
            title="Don't run it; send your note back to the agent"
          >
            Reject
          </Button>
          <Button
            variant="secondary"
            icon={<Play size={14} />}
            onClick={allowOnce}
            title="Run this command only"
          >
            Allow once
          </Button>
          <Button
            variant="primary"
            icon={<ShieldCheck size={14} />}
            onClick={allowSession}
            title="Trust all commands for the rest of this chat"
          >
            Allow for session
          </Button>
        </div>

        <p className="cmd-approval__hint">
          <ShieldAlert size={12} /> “Allow for session” skips this prompt for the rest of the
          conversation. You can still review file edits separately.
        </p>
      </div>
    </Modal>
  );
}

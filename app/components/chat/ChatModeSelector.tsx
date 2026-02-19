import * as Popover from '@radix-ui/react-popover';
import { useState } from 'react';
import { classNames } from '~/utils/classNames';
import { IconButton } from '~/components/ui/IconButton';

type ChatMode = 'build' | 'plan' | 'discuss';

interface ChatModeSelectorProps {
  chatMode?: 'discuss' | 'build';
  setChatMode?: (mode: 'discuss' | 'build') => void;
  planMode?: boolean;
  setPlanMode?: (enabled: boolean) => void;
}

const modes: { id: ChatMode; icon: string; label: string; description: string }[] = [
  { id: 'build', icon: 'i-ph:lightning', label: 'Build', description: 'Write code and create files' },
  { id: 'plan', icon: 'i-ph:list-checks', label: 'Plan', description: 'Create a plan first, then build' },
  { id: 'discuss', icon: 'i-ph:chats', label: 'Discuss', description: 'Chat without code changes' },
];

export function ChatModeSelector({ chatMode, setChatMode, planMode, setPlanMode }: ChatModeSelectorProps) {
  const [open, setOpen] = useState(false);

  // Derive active mode from the two separate state props
  const activeMode: ChatMode = planMode ? 'plan' : chatMode === 'discuss' ? 'discuss' : 'build';
  const activeModeConfig = modes.find((m) => m.id === activeMode)!;

  const handleSelect = (mode: ChatMode) => {
    switch (mode) {
      case 'build':
        setPlanMode?.(false);
        setChatMode?.('build');
        break;
      case 'plan':
        setPlanMode?.(true);
        setChatMode?.('build');
        break;
      case 'discuss':
        setPlanMode?.(false);
        setChatMode?.('discuss');
        break;
    }

    setOpen(false);
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <IconButton
          title="Chat mode"
          className={classNames(
            'transition-all flex items-center gap-1 px-1.5',
            activeMode !== 'build'
              ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent'
              : 'bg-bolt-elements-item-backgroundDefault text-bolt-elements-item-contentDefault',
          )}
        >
          <div className={classNames(activeModeConfig.icon, 'text-xl')} />
          <span className="text-xs">{activeModeConfig.label}</span>
        </IconButton>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={8}
          side="top"
          align="start"
          className="bg-bolt-elements-background-depth-2 rounded-lg shadow-xl z-workbench border border-bolt-elements-borderColor overflow-hidden min-w-[200px]"
        >
          <div className="p-1">
            {modes.map((mode) => (
              <button
                key={mode.id}
                className={classNames(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors',
                  activeMode === mode.id
                    ? 'bg-bolt-elements-item-backgroundAccent text-bolt-elements-item-contentAccent'
                    : 'text-bolt-elements-textSecondary hover:bg-bolt-elements-item-backgroundDefault hover:text-bolt-elements-textPrimary',
                )}
                onClick={() => handleSelect(mode.id)}
              >
                <div className={classNames(mode.icon, 'text-lg flex-shrink-0')} />
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{mode.label}</span>
                  <span className="text-xs opacity-70">{mode.description}</span>
                </div>
                {activeMode === mode.id && <div className="i-ph:check ml-auto text-lg flex-shrink-0" />}
              </button>
            ))}
          </div>
          <Popover.Arrow className="fill-bolt-elements-background-depth-2" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

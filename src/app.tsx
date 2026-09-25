import { useEffect, useLayoutEffect, useState } from 'preact/hooks';
import { getSaveError, useData } from './lib/store';
import { toastNavigated } from './lib/toast';
import { isDateKey, todayKey } from './lib/dates';
import { goBack, takeScrollToTop, useRoute } from './lib/router';
import { BottomNav, ToastHost, type Tab } from './components/Common';
import { ChevronLeft } from './components/Icons';
import { Today } from './screens/Today';
import { Week } from './screens/Week';
import { HabitPage } from './screens/HabitPage';
import { HabitForm } from './screens/HabitForm';
import { Settings } from './screens/Settings';

function Missing({ message }: { message: string }) {
  return (
    <main class="screen missing" aria-labelledby="missing-title">
      <header class="topbar">
        <button type="button" class="round-btn lg" aria-label="Back" onClick={() => goBack('/')}>
          <ChevronLeft size={20} />
        </button>
        <span class="spacer-44" />
      </header>
      <h1 id="missing-title" class="page-title">
        Not here
      </h1>
      <p class="body-text">{message}</p>
      <a class="btn light" href="#/">
        Go to Today
      </a>
    </main>
  );
}

export function App() {
  const route = useRoute();
  const data = useData();
  const saveError = getSaveError();
  useEffect(() => toastNavigated(), [route.path]);
  // A newly opened screen starts at the top; going back keeps the browser's restored position.
  useLayoutEffect(() => {
    if (takeScrollToTop()) window.scrollTo(0, 0);
  }, [route.raw]);

  // An app left open overnight should move on to the new day when it comes back.
  const [, setWake] = useState(0);
  useEffect(() => {
    const wake = () => document.visibilityState === 'visible' && setWake((n) => n + 1);
    document.addEventListener('visibilitychange', wake);
    return () => document.removeEventListener('visibilitychange', wake);
  }, []);
  const today = todayKey();
  const { segments, query } = route;

  let screen;
  let tab: Tab | null = null;
  switch (segments[0] ?? '') {
    case '': {
      const raw = query.get('date');
      screen = <Today date={isDateKey(raw) && raw <= today ? raw : today} today={today} />;
      tab = 'today';
      break;
    }
    case 'week': {
      const start = query.get('start');
      screen = <Week start={isDateKey(start) ? start : undefined} today={today} />;
      tab = 'week';
      break;
    }
    case 'habit': {
      const habit = data.habits.find((h) => h.id === segments[1]);
      if (!habit) screen = <Missing message="That habit was deleted, or it hasn't reached this device yet." />;
      else if (segments[2] === 'edit') screen = <HabitForm key={`edit-${habit.id}`} habit={habit} />;
      else screen = <HabitPage key={habit.id} habit={habit} today={today} />;
      break;
    }
    case 'new':
      screen = <HabitForm key={`new-${query.get('text') ?? ''}`} initialText={query.get('text') ?? ''} />;
      break;
    case 'settings':
      screen = <Settings />;
      tab = 'settings';
      break;
    default:
      screen = <Missing message="There's no page at this address." />;
  }

  return (
    <>
      <div key={route.path} class="screen-host">
        {screen}
      </div>
      {tab && <BottomNav current={tab} />}
      {saveError && (
        <div class="save-error" role="alert">
          {saveError}
        </div>
      )}
      <ToastHost low={!tab} />
    </>
  );
}

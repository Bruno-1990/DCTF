import { Irpf2026AuthProvider } from './contexts/Irpf2026AuthContext';
import { AppRouter } from './router';

function App() {
  return (
    <Irpf2026AuthProvider>
      <AppRouter />
    </Irpf2026AuthProvider>
  );
}

export default App;
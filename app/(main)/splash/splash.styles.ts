import { StyleSheet } from 'react-native';

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  logoContainer: { alignItems: 'center' },
  title: {
    fontSize: 48,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 24,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748b',
    fontWeight: '500',
    textAlign: 'center',
  },
  question: {
    color: '#ef4444',
    fontSize: 48,
    fontWeight: '700',
  },
});

export default styles;

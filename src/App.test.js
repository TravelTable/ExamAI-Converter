import { render, screen } from '@testing-library/react';
import App from './App';

test('renders exam app header', () => {
  render(<App />);
  const headerElement = screen.getByText(/ExamAI Converter/i);
  expect(headerElement).toBeInTheDocument();
});

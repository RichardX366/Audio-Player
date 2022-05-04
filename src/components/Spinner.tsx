import classNames from 'classnames';
import React from 'react';

interface SpinnerProps {
  color?: 'green' | 'light' | 'dark' | 'theme';
  size?: string;
}

const Spinner: React.FC<SpinnerProps> = ({ color = 'theme', size = 'h-5' }) => (
  <svg
    className={classNames('animate-spin', size, {
      'text-white': color === 'light',
      'text-gray-900': color === 'dark',
      'text-green-500': color === 'green',
      'text-cyan-500': color === 'theme',
    })}
    xmlns='http://www.w3.org/2000/svg'
    fill='none'
    viewBox='0 0 24 24'
  >
    <circle
      className='opacity-25'
      cx='12'
      cy='12'
      r='10'
      stroke='currentColor'
      strokeWidth='4'
    />
    <path
      className='opacity-75'
      fill='currentColor'
      d='M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z'
    />
  </svg>
);

export default Spinner;

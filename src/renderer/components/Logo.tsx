import React from 'react';

interface LogoProps {
  size?: number;
  className?: string;
  variant?: 'squircle' | 'glyph-only';
}

/**
 * Official Bhai Brand Logo
 * Features the signature 'b_' mark:
 * Deep midnight squircle container, bold white 'b', and golden-orange pill underscore '_'.
 */
export const BhaiLogo: React.FC<LogoProps> = ({
  size = 20,
  className = '',
  variant = 'squircle'
}) => {
  if (variant === 'glyph-only') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
      >
        {/* Lowercase 'b' */}
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M7 11.5C7 10.12 8.12 9 9.5 9C10.88 9 12 10.12 12 11.5V14.86C13.25 13.99 14.84 13.5 16.5 13.5C20.92 13.5 24.5 17.08 24.5 21.5C24.5 25.92 20.92 29.5 16.5 29.5C14.84 29.5 13.25 29.01 12 28.14V28.5C12 29.33 11.33 30 10.5 30C9.67 30 9 29.33 9 28.5V11.5H7ZM12 21.5C12 23.99 14.01 26 16.5 26C18.99 26 21 23.99 21 21.5C21 19.01 18.99 17 16.5 17C14.01 17 12 19.01 12 21.5Z"
          fill="currentColor"
        />
        {/* Golden-Orange Underscore '_' */}
        <rect
          x="23"
          y="25.5"
          width="9"
          height="4.5"
          rx="2.25"
          fill="#FF9800"
        />
      </svg>
    );
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="bhai_squircle_dark" x1="0" y1="0" x2="0" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#242428" />
          <stop offset="100%" stopColor="#141416" />
        </linearGradient>
      </defs>

      {/* macOS Squircle Container */}
      <rect
        width="44"
        height="44"
        rx="12"
        fill="url(#bhai_squircle_dark)"
      />
      <rect
        x="0.5"
        y="0.5"
        width="43"
        height="43"
        rx="11.5"
        stroke="rgba(255, 255, 255, 0.12)"
      />

      {/* Chunky Lowercase 'b' matching official logo */}
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10.5 13.5C10.5 12.12 11.62 11 13 11C14.38 11 15.5 12.12 15.5 13.5V16.86C16.75 15.99 18.34 15.5 20 15.5C24.42 15.5 28 19.08 28 23.5C28 27.92 24.42 31.5 20 31.5C18.34 31.5 16.75 31.01 15.5 30.14V30.5C15.5 31.33 14.83 32 14 32C13.17 32 12.5 31.33 12.5 30.5V13.5H10.5ZM15.5 23.5C15.5 25.99 17.51 28 20 28C22.49 28 24.5 25.99 24.5 23.5C24.5 21.01 22.49 19 20 19C17.51 19 15.5 21.01 15.5 23.5Z"
        fill="#FFFFFF"
      />

      {/* Golden-Orange Underscore '_' */}
      <rect
        x="26.5"
        y="27"
        width="9"
        height="4.5"
        rx="2.25"
        fill="#FF9800"
      />
    </svg>
  );
};

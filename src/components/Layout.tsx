import React, { ReactNode } from 'react';

interface LayoutProps {
  children: ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-[120rem] mx-auto px-4 sm:px-6 lg:px-8">
        {children}
      </div>
    </div>
  );
};
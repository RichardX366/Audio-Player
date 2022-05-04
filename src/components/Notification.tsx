import React, { Fragment, useEffect } from 'react';
import { Transition } from '@headlessui/react';
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
  XCircleIcon,
} from '@heroicons/react/outline';
import { XIcon } from '@heroicons/react/solid';
import { createState, useHookstate } from '@hookstate/core';

const globalNotifications = createState<{
  show: boolean;
  title: string;
  description?: string;
  duration?: number;
  type: 'error' | 'success' | 'warning';
}>({
  show: false,
  title: '',
  type: 'success',
});

export const error = (
  err: any,
  params?: { title?: string; fallback?: string; duration?: number },
): void => {
  console.trace(err);
  globalNotifications.set({
    title: params?.title || 'Something went wrong',
    description:
      typeof err === 'string'
        ? err
        : err?.message?.toString() || params?.fallback,
    show: true,
    type: 'error',
  });
};

export const notify = ({
  title,
  description,
  duration,
}: {
  title?: string;
  description?: string;
  duration?: number;
}): void => {
  globalNotifications.set({
    title: title || 'Success',
    description,
    duration,
    show: true,
    type: 'success',
  });
};

export const warn = ({
  title,
  description,
  duration,
}: {
  title?: string;
  description?: string;
  duration?: number;
}): void => {
  globalNotifications.set({
    title: title || 'Warning',
    description,
    duration,
    show: true,
    type: 'warning',
  });
};

const Notification: React.FC = () => {
  const state = useHookstate(globalNotifications);
  useEffect(() => {
    if (state.show.value) {
      const timeout = setTimeout(() => {
        state.show.set(false);
      }, state.duration.value || 3000);
      return () => clearTimeout(timeout);
    }
    return;
    // eslint-disable-next-line
  }, [state.show.value]);

  const renderIcon = () => {
    switch (state.type.value) {
      case 'success':
        return (
          <CheckCircleIcon
            className='h-6 w-6 text-green-400'
            aria-hidden='true'
          />
        );
      case 'error':
        return (
          <XCircleIcon className='h-6 w-6 text-red-400' aria-hidden='true' />
        );
      case 'warning':
        return (
          <ExclamationCircleIcon
            className='h-6 w-6 text-yellow-400'
            aria-hidden='true'
          />
        );
      default:
        return null;
    }
  };
  return (
    <div
      aria-live='assertive'
      className='fixed inset-0 flex items-end justify-start px-4 py-6 pointer-events-none sm:p-6 sm:items-start sm:justify-end z-50'
    >
      <Transition
        show={state.show.value}
        as={Fragment}
        enter='transform ease-out duration-300 transition'
        enterFrom='translate-y-2 opacity-0 sm:translate-y-0 sm:translate-x-2'
        enterTo='translate-y-0 opacity-100 sm:translate-x-0'
        leave='transition ease-in duration-100'
        leaveFrom='opacity-100'
        leaveTo='opacity-0'
      >
        <div className='max-w-sm w-full bg-white shadow-lg rounded-lg pointer-events-auto ring-1 ring-black ring-opacity-5 overflow-hidden'>
          <div className='p-4'>
            <div className='flex items-start'>
              <div className='flex-shrink-0'>{renderIcon()}</div>
              <div className='ml-3 w-0 flex-1 pt-0.5 text-left'>
                <p className='text-sm font-medium text-gray-900'>
                  {state.title.value}
                </p>
                <p className='mt-1 text-sm text-gray-500'>
                  {state.description.value}
                </p>
              </div>
              <div className='ml-4 flex-shrink-0 flex'>
                <button
                  className='bg-white rounded-md inline-flex text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500'
                  onClick={() => {
                    state.show.set(false);
                  }}
                >
                  <span className='sr-only'>Close</span>
                  <XIcon className='h-5 w-5' aria-hidden='true' />
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  );
};

export default Notification;

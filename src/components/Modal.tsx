import React, { ReactNode, useRef, useEffect, useState } from 'react';
import classNames from 'classnames';
import {
  disableBodyScroll,
  enableBodyScroll,
  clearAllBodyScrollLocks,
} from 'body-scroll-lock';
import Spinner from './Spinner';

interface ModalData {
  title: string;
  subtitle?: string;
  onSubmit: () => Promise<void> | void;
  onCancel?: () => Promise<void> | void;
  submitText?: string;
  icon?: ReactNode;
  loading?: boolean;
  children: ReactNode;
}

interface ModalProps extends ModalData {
  show: boolean;
  setShow: (v: boolean) => void;
}

const Modal: React.FC<ModalProps> = ({
  title,
  subtitle,
  submitText,
  onSubmit,
  onCancel,
  show,
  setShow,
  icon,
  loading,
  children,
}) => {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const [pseudoShow, setPseudoShow] = useState(false);
  const [modalDeleted, setModalDeleted] = useState(true);
  const modalRef = useRef<HTMLDivElement>(null);

  const showRef = useRef(show);
  if (showRef.current !== show) showRef.current = show;

  useEffect(() => {
    if (show && modalDeleted && !pseudoShow) setModalDeleted(false);
    else if (show && !modalDeleted && !pseudoShow) {
      setPseudoShow(true);
      cancelButtonRef.current?.focus();
      modalRef.current?.scroll({ top: 0 });
      disableBodyScroll(modalRef.current as HTMLDivElement);
    } else if (!show && !modalDeleted && pseudoShow) {
      setPseudoShow(false);
      enableBodyScroll(modalRef.current as HTMLDivElement);
    }
  }, [show, modalDeleted, pseudoShow]);

  const handleKeyPress = (e: KeyboardEvent) => {
    if (showRef.current && e.key === 'Escape') {
      setShow(false);
      onCancel?.call(null);
    }
  };

  useEffect(() => {
    document.addEventListener('keydown', handleKeyPress);
    return () => {
      document.removeEventListener('keydown', handleKeyPress);
      clearAllBodyScrollLocks();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      {!modalDeleted && (
        <div
          className={classNames(
            pseudoShow
              ? 'ease-out duration-300 opacity-100'
              : 'duration-200 ease-in pointer-events-none opacity-0',
            'fixed inset-0 z-10 overflow-y-auto transition-opacity',
          )}
          ref={modalRef}
          onTransitionEnd={() => !show && setModalDeleted(true)}
        >
          <div className='flex items-end justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0'>
            <div
              className='fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75'
              onClick={() => {
                setShow(false);
                onCancel?.call(null);
              }}
            />

            {/* This element is to trick the browser into centering the modal contents. */}
            <span
              className='hidden sm:inline-block sm:align-middle sm:h-screen'
              aria-hidden='true'
            >
              &#8203;
            </span>
            <div className='inline-block text-left align-bottom transition-all transform shadow-xl sm:my-8 sm:align-middle sm:max-w-lg sm:w-full'>
              <div className='px-4 pt-5 pb-4 bg-white sm:p-5 sm:pb-4 rounded-t-lg'>
                <div className='sm:flex sm:items-start'>
                  <div className='w-full mt-3 sm:mt-0 sm:ml-2 sm:text-left'>
                    <div className='flex justify-between'>
                      <div>
                        <div className='flex items-center gap-3'>
                          <h3 className='text-xl font-medium leading-6 text-gray-900'>
                            {title}
                          </h3>
                          {loading && <Spinner color='dark' size='h-4' />}
                        </div>
                        {subtitle && (
                          <p className='mt-1 text-sm text-gray-500'>
                            {subtitle}
                          </p>
                        )}
                      </div>
                      {icon && (
                        <div className='overflow-hidden w-12 h-12 rounded-full'>
                          {icon}
                        </div>
                      )}
                    </div>
                    <div className='mt-2'>{children}</div>
                  </div>
                </div>
              </div>

              <div className='px-4 py-3 bg-gray-50 sm:flex sm:flex-row-reverse sm:text-sm rounded-b-lg'>
                <button
                  type='button'
                  className={classNames(
                    loading
                      ? 'cursor-not-allowed bg-THEME-700 text-gray-100'
                      : 'focus:ring-THEME-500 hover:bg-THEME-700 bg-THEME-600 text-white',
                    'inline-flex justify-center w-full px-4 py-2 font-medium border border-transparent rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 sm:ml-3 sm:w-auto',
                  )}
                  onClick={onSubmit}
                  disabled={loading}
                >
                  {submitText || (loading ? 'Submitting' : 'Submit')}
                </button>
                <button
                  type='button'
                  className='inline-flex justify-center w-full px-4 py-2 mt-3 font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400 sm:mt-0 sm:ml-3 sm:w-auto'
                  onClick={() => {
                    setShow(false);
                    onCancel?.call(null);
                  }}
                  ref={cancelButtonRef}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Modal;

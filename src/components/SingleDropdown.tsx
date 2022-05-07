import React from 'react';
import { Listbox, Transition } from '@headlessui/react';
import { CheckIcon, SelectorIcon } from '@heroicons/react/solid';
import classNames from 'classnames';

interface DropdownData {
  id: string;
  title: string;
  active?: boolean;
  disabled?: boolean;
}

interface SingleDropdownProps {
  showStatus?: boolean;
  label?: string;
  data: DropdownData[];
  onChange: (v: DropdownData['id']) => void;
  value: DropdownData['id'];
  description?: string;
  required?: boolean;
}

const SingleDropdown: React.FC<SingleDropdownProps> = ({
  showStatus,
  label,
  data,
  onChange,
  value,
  description,
  required,
}) => {
  const selected = data.find((v) => v.id === value);
  return (
    <div className='w-full rounded-md shadow-sm'>
      <Listbox value={value} onChange={onChange}>
        <div className='relative w-full'>
          <Listbox.Label className='text-sm font-medium text-gray-700'>
            {label}
            <span className='text-red-500'>{required && ' *'}</span>
          </Listbox.Label>
          <Listbox.Button className='relative w-full py-2 pl-3 pr-10 text-left bg-white border border-gray-300 rounded-md shadow-sm cursor-default focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 sm:text-sm'>
            <div className='flex items-center'>
              {showStatus && (
                <span
                  aria-label={selected?.active ? 'Online' : 'Offline'}
                  className={classNames(
                    selected?.active ? 'bg-cyan-400' : 'bg-gray-200',
                    'flex-shrink-0 inline-block h-2 w-2 rounded-full mr-3',
                  )}
                />
              )}
              <span className='block truncate'>
                {selected?.title || 'None Selected'}
              </span>
            </div>
            <span className='absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none'>
              <SelectorIcon
                className='w-5 h-5 text-gray-400'
                aria-hidden='true'
              />
            </span>
          </Listbox.Button>

          <Transition
            leave='transition ease-in duration-100'
            leaveTo='opacity-0'
          >
            <Listbox.Options className='absolute z-10 w-full py-1 mt-1 overflow-auto text-base bg-white rounded-md shadow-lg max-h-60 ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm'>
              {data.map((item) => {
                const isSelected = item.id === value;
                return (
                  <Listbox.Option
                    key={item.id}
                    value={item.id}
                    className={({ active }) =>
                      classNames(
                        'flex items-center select-none relative py-2 pl-3 pr-9',
                        { 'bg-cyan-100': active },
                        item.disabled
                          ? 'bg-gray-50 cursor-not-allowed text-gray-500'
                          : 'hover:bg-cyan-100 cursor-pointer text-gray-900',
                      )
                    }
                    disabled={item.disabled}
                  >
                    <div className='flex items-center'>
                      {showStatus && (
                        <span
                          className={classNames(
                            item.active ? 'bg-cyan-400' : 'bg-gray-200',
                            'flex-shrink-0 inline-block h-2 w-2 rounded-full mr-3',
                          )}
                          aria-hidden='true'
                        />
                      )}
                      <span
                        className={classNames(
                          isSelected ? 'font-semibold' : 'font-normal',
                          'block truncate',
                        )}
                      >
                        {item.title}
                      </span>
                      {isSelected && (
                        <span
                          className={classNames(
                            isSelected ? 'text-cyan-600' : 'text-white',
                            'absolute inset-y-0 right-0 flex items-center pr-4 group-hover:text-white',
                          )}
                        >
                          <CheckIcon className='w-5 h-5' aria-hidden='true' />
                        </span>
                      )}
                    </div>
                  </Listbox.Option>
                );
              })}
            </Listbox.Options>
          </Transition>
        </div>
      </Listbox>
      {description && (
        <p className='mt-2 text-gray-500 text-sm'>{description}</p>
      )}
    </div>
  );
};

export default SingleDropdown;

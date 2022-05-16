import React, { useEffect, useMemo, useState } from 'react';
import { gapi } from 'gapi-script';
import googleLogo from './google.png';
import emptyMusic from './emptyMusic.jpg';
import Spinner from './components/Spinner';
import Notification, { error, notify, warn } from './components/Notification';
import { ITags } from 'id3-parser/lib/interface';
import { parse } from 'id3-parser';
import { db, Song } from './db';
import { useLiveQuery } from 'dexie-react-hooks';
import { createState, none, useHookstate } from '@hookstate/core';
import { Persistence } from '@hookstate/persistence';
import dayjs from 'dayjs';
import classNames from 'classnames';
import Input from './components/Input';
import { PencilIcon, TrashIcon } from '@heroicons/react/outline';
import { PauseIcon, PlayIcon } from '@heroicons/react/solid';
import Modal from './components/Modal';
import SingleDropdown from './components/SingleDropdown';

enum Page {
  Songs = 'Songs',
  Albums = 'Albums',
}

enum Comparison {
  is = 'is',
  isNot = 'is not',
  includes = 'includes',
  doesNotInclude = 'does not include',
}

enum Attribute {
  Title = 'Title',
  Artist = 'Artist',
  Album = 'Album',
  Genre = 'Genre',
}

interface Rule {
  attribute: Attribute;
  comparison: Comparison;
  data: string;
}

interface Album {
  name: string;
  followAllRules: boolean;
  rules: Rule[];
}

const globalLastUpdated = createState('Never');
globalLastUpdated.attach(Persistence('lastUpdated'));
const globalAlbums = createState<Album[]>([]);
globalAlbums.attach(Persistence('albums'));

const audio = new Audio();

const emptyRule: Rule = {
  attribute: Attribute.Album,
  comparison: Comparison.is,
  data: '',
};

const App: React.FC = () => {
  const [loadingNewSongs, setLoadingNewSongs] = useState(false);
  const [user, setUser] = useState<{
    name: string;
    email: string;
    profilePicture: string;
    oauthToken: string;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(Page.Songs);
  const lastUpdated = useHookstate(globalLastUpdated);
  const albums = useHookstate(globalAlbums);
  const currentAlbum = useHookstate('');
  const [currentSong, setCurrentSong] = useState<Song | null>(null);
  const [playing, setPlaying] = useState(false);
  const [, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showCreateAlbum, setShowCreateAlbum] = useState(false);
  const [showEditAlbum, setShowEditAlbum] = useState(false);
  const [showEditSong, setShowEditSong] = useState(false);
  const createAlbumForm = useHookstate({
    name: '',
    followAllRules: false,
    rules: [emptyRule],
  });
  const editAlbumForm = useHookstate<Album & { idx: number }>({
    name: '',
    followAllRules: false,
    rules: [],
    idx: 0,
  });
  const editSongForm = useHookstate({
    id: '',
    album: '',
    title: '',
    artist: '',
    genre: '',
  });

  const allSongs = useLiveQuery(() => db.songs.toArray(), []);

  const songs = useLiveQuery(
    () =>
      db.songs
        .filter((song) =>
          song.title.toLowerCase().includes(searchQuery.toLowerCase()),
        )
        .sortBy('album'),
    [searchQuery],
  );

  const songMap = useMemo(
    () =>
      allSongs
        ? Object.fromEntries(allSongs.map((song) => [song.id, song]))
        : {},
    [allSongs],
  );

  const [songToCover, setSongToCover] = useState<{
    [id: string]: { cover: string; lastUpdatedUtc: number };
  }>({});

  useEffect(() => {
    const newSongToCover = { ...songToCover };
    allSongs?.forEach((song) => {
      if (
        songToCover[song.id] &&
        song.lastEditedUtc > songToCover[song.id].lastUpdatedUtc
      ) {
        delete songToCover[song.id];
      }
      if (!songToCover[song.id] && song.cover) {
        newSongToCover[song.id] = {
          cover: URL.createObjectURL(song.cover),
          lastUpdatedUtc: song.lastEditedUtc,
        };
      }
    });
    Object.keys(songToCover).forEach((id) => {
      if (songMap && !songMap[id]) {
        URL.revokeObjectURL(songToCover[id].cover);
        delete newSongToCover[id];
      }
    });
    setSongToCover(newSongToCover);
    audio.onended = () => playSong();
  }, [allSongs]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAuthChange = (signedIn: boolean) => {
    if (signedIn) {
      const profile = gapi.auth2
        .getAuthInstance()
        .currentUser.get()
        .getBasicProfile();
      setUser({
        email: profile.getEmail(),
        name: profile.getName(),
        profilePicture: profile.getImageUrl(),
        oauthToken: gapi.auth2
          .getAuthInstance()
          .currentUser.get()
          .getAuthResponse().access_token,
      });
    } else {
      setUser(null);
    }
  };

  const formatSongToStorage = (
    song: google.picker.DocumentObject & {
      blob: Blob;
      metaData: ITags;
    },
  ): Song => {
    if (!song.metaData.title) song.metaData.title = song.name.split('.')[0];
    return {
      id: song.id,
      blob: song.blob,
      title: song.metaData.title.replaceAll('\u0000', ''),
      lastEditedUtc: song.lastEditedUtc,
      artist: song.metaData.artist?.replaceAll('\u0000', ''),
      album: song.metaData.album?.replaceAll('\u0000', ''),
      genre: song.metaData.genre?.replaceAll('\u0000', ''),
      year: song.metaData.year?.replaceAll('\u0000', ''),
      cover: song.metaData.image
        ? new Blob([(song.metaData.image.data as Uint8Array).buffer], {
            type: song.metaData.image.mime,
          })
        : undefined,
    };
  };

  const handleAddSong = async (song: google.picker.DocumentObject) => {
    try {
      const duplicate = await db.songs.get(song.id);
      if (duplicate && duplicate.lastEditedUtc >= song.lastEditedUtc) {
        return;
      } else {
        const blob = await fetch(
          `https://www.googleapis.com/drive/v3/files/${song.id}?alt=media`,
          {
            headers: {
              Authorization: `Bearer ${user?.oauthToken}`,
            },
          },
        ).then((res) => res.blob());
        const metaData = parse(new Uint8Array(await blob.arrayBuffer()));
        if (!metaData) throw new Error('Invalid metadata');
        if (duplicate) {
          db.songs.update(
            song.id,
            formatSongToStorage({ ...song, blob, metaData }),
          );
        } else {
          db.songs.add(formatSongToStorage({ ...song, blob, metaData }));
        }
      }
      return;
    } catch (e) {
      throw e;
    }
  };

  const handleAddFolder = async (folder: google.picker.DocumentObject) => {
    const list = await gapi.client.drive.files.list({
      pageSize: 1000,
      q: `'${folder.id}' in parents and (mimeType contains 'audio/' or mimeType = 'application/vnd.google-apps.folder')`,
      fields: 'files(id, modifiedTime, name, mimeType)',
    });
    await Promise.all(
      list.result.files?.map(async (songOrFolder) => {
        const doc = {
          id: songOrFolder.id as string,
          name: songOrFolder.name as string,
          lastEditedUtc: new Date(
            songOrFolder.modifiedTime as string,
          ).getTime(),
        } as google.picker.DocumentObject;
        if (songOrFolder.mimeType === 'application/vnd.google-apps.folder') {
          await handleAddFolder(doc);
        } else {
          await handleAddSong(doc);
        }
      }) || [],
    );
  };

  const handlePickerChange = async (data: google.picker.DocumentObject[]) => {
    try {
      setLoadingNewSongs(true);
      await Promise.all(
        data.map(async (songOrFolder) => {
          if (songOrFolder.mimeType === 'application/vnd.google-apps.folder') {
            handleAddFolder(songOrFolder);
          } else {
            await handleAddSong(songOrFolder);
          }
        }),
      );
      notify({ description: 'Songs uploaded and updated' });
      setLoadingNewSongs(false);
      lastUpdated.set(dayjs().format('MMM D, YYYY'));
    } catch (e) {
      error(e);
    }
  };

  const createPicker = () => {
    const myDrive = new google.picker.DocsView(google.picker.ViewId.DOCS);
    myDrive.setMimeTypes(
      'audio/wav,audio/mpeg,audio/mp4,audio/aac,audio/aacp,audio/ogg,audio/webm,audio/flac',
    );
    myDrive.setIncludeFolders(true);
    myDrive.setSelectFolderEnabled(true);
    myDrive.setParent('root');
    const sharedDrives = new google.picker.DocsView(google.picker.ViewId.DOCS);
    sharedDrives.setMimeTypes(
      'audio/wav,audio/mpeg,audio/mp4,audio/aac,audio/aacp,audio/ogg,audio/webm,audio/flac',
    );
    sharedDrives.setIncludeFolders(true);
    sharedDrives.setSelectFolderEnabled(true);
    sharedDrives.setEnableDrives(true);
    new google.picker.PickerBuilder()
      .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
      .enableFeature(google.picker.Feature.SUPPORT_DRIVES)
      .setAppId(process.env.REACT_APP_PROJECT_ID as string)
      .setOAuthToken(user?.oauthToken as string)
      .addView(myDrive)
      .addView(sharedDrives)
      .setDeveloperKey(process.env.REACT_APP_API_KEY as string)
      .hideTitleBar()
      .setCallback((data) =>
        data.action === 'picked'
          ? handlePickerChange(data.docs)
          : data.action === 'cancel' &&
            warn({
              title: 'Note:',
              description:
                'If you want to use a synced folder or file, search up the name of the computer or containing folder and it will appear',
            }),
      )
      .build()
      .setVisible(true);
  };

  const filterSongs = ({ rules, followAllRules }: Album) =>
    allSongs?.filter((song) => {
      for (let i = 0; i < rules.length; i++) {
        const rule = rules[i];
        const attribute = song[rule.attribute.toLowerCase() as 'title'];
        if (!attribute) return false;
        if (
          !followAllRules &&
          ((rule.comparison === Comparison.is && attribute === rule.data) ||
            (rule.comparison === Comparison.isNot && attribute !== rule.data) ||
            (rule.comparison === Comparison.includes &&
              attribute.includes(rule.data)) ||
            (rule.comparison === Comparison.doesNotInclude &&
              !attribute.includes(rule.data)))
        ) {
          return true;
        }
        if (
          followAllRules &&
          ((rule.comparison === Comparison.is && attribute !== rule.data) ||
            (rule.comparison === Comparison.isNot && attribute === rule.data) ||
            (rule.comparison === Comparison.includes &&
              !attribute.includes(rule.data)) ||
            (rule.comparison === Comparison.doesNotInclude &&
              attribute.includes(rule.data)))
        ) {
          return false;
        }
      }
      if (followAllRules) return true;
      else return false;
    });

  const playSong = (song?: Song) => {
    URL.revokeObjectURL(audio.src);
    const filteredSongs = filterSongs(
      albums.value.find((album) => album.name === currentAlbum.value) || {
        followAllRules: true,
        rules: [],
        name: '',
      },
    );
    if (!filteredSongs?.length) {
      error('There are currently no songs to play');
      return;
    }
    if (!song) {
      let newSong =
        filteredSongs[Math.floor(Math.random() * filteredSongs.length)];
      while (newSong.id === currentSong?.id && filteredSongs.length > 1) {
        newSong =
          filteredSongs[Math.floor(Math.random() * filteredSongs.length)];
      }
      song = newSong;
    }
    setCurrentSong(song);
    audio.src = URL.createObjectURL(song.blob);
    audio.play();
  };

  useEffect(() => {
    gapi.load('picker', () =>
      gapi.load('client:auth2', async () => {
        await gapi.client.init({
          apiKey: process.env.REACT_APP_API_KEY,
          clientId: process.env.REACT_APP_CLIENT_ID,
          discoveryDocs: [
            'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
          ],
          scope: 'https://www.googleapis.com/auth/drive.readonly',
        });
        const auth = gapi.auth2.getAuthInstance();
        auth.isSignedIn.listen(handleAuthChange);
        handleAuthChange(auth.isSignedIn.get());
      }),
    );
    audio.ontimeupdate = () => setCurrentTime(audio.currentTime);
    audio.ondurationchange = () => setDuration(audio.duration);
    audio.onpause = () => setPlaying(false);
    audio.onplay = () => setPlaying(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className='absolute inset-0 p-4 sm:grid flex flex-col sm:grid-cols-8 sm:gap-4 gap-y-2 sm:grid-rows-1'>
      <Notification />
      <div className='col-span-2 flex flex-col gap-2 sm:gap-4'>
        {user ? (
          <div className='bg-white rounded-lg flex justify-between p-3'>
            <div className='flex flex-col items-start'>
              <span className='font-medium text-lg'>{user.name}</span>
              <span className='text-gray-500 text-xs'>{user.email}</span>
              <button
                onClick={gapi.auth2?.getAuthInstance().signOut}
                className='text-sm text-red-800 hover:text-red-700 font-medium transition-colors'
              >
                Sign Out
              </button>
            </div>
            <img
              src={user.profilePicture}
              alt='pfp'
              className='w-16 border border-gray-300 rounded-full'
            />
          </div>
        ) : (
          <button
            className='bg-white hover:bg-gray-100 transition-colors rounded-lg w-full flex justify-center items-center gap-4 p-4 text-gray-700'
            onClick={() => gapi.auth2?.getAuthInstance().signIn()}
          >
            <img className='w-10 h-10' alt='Google Logo' src={googleLogo} />
            <p className='text-3xl'>Sign in with Google</p>
          </button>
        )}
        <button
          className={classNames(
            loadingNewSongs || !user
              ? 'bg-gray-100 cursor-not-allowed'
              : 'hover:bg-gray-100 bg-white',
            'w-full p-2 rounded-lg text-lg transition-colors relative',
          )}
          onClick={createPicker}
          disabled={loadingNewSongs || !user}
        >
          {loadingNewSongs && <Spinner size='absolute h-7 inset-4' />}
          Upload or Update a Song
          <p className='text-xs text-gray-500'>
            Last Updated: {lastUpdated.value}
          </p>
        </button>
        <span className='relative z-0 flex shadow-sm rounded-md'>
          {Object.values(Page).map((pageName, idx, { length }) => (
            <button
              onClick={() => setPage(pageName)}
              key={pageName}
              className={classNames(
                {
                  'rounded-l-md': idx === 0,
                  'rounded-r-md': idx === length - 1,
                  '-ml-px': idx !== 0,
                },
                page === pageName
                  ? 'bg-gray-100 cursor-not-allowed ring-1 ring-green-500 border-green-500 outline-none z-10'
                  : 'hover:bg-gray-50 focus:z-10 focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500',
                'relative w-full inline-flex justify-center px-4 py-2 border border-gray-300 bg-white text-sm text-gray-700',
              )}
            >
              {pageName}
            </button>
          ))}
        </span>
        {(() => {
          switch (page) {
            case Page.Songs: {
              return (
                <Input
                  value={searchQuery}
                  onChange={setSearchQuery}
                  placeholder='Search'
                />
              );
            }
            case Page.Albums: {
              return (
                <button
                  className='bg-green-800 text-white hover:bg-green-700 p-2 rounded-lg border border-green-900'
                  onClick={() => {
                    createAlbumForm.set({
                      name: '',
                      followAllRules: false,
                      rules: [
                        {
                          attribute: Attribute.Album,
                          comparison: Comparison.is,
                          data: '',
                        },
                      ],
                    });
                    setShowCreateAlbum(true);
                  }}
                >
                  Create a New Album
                </button>
              );
            }
          }
        })()}
        <div className='bg-gradient-to-br from-blue-800 to-cyan-800 p-5 bg-fixed rounded-lg flex sm:flex-col gap-4'>
          <img
            alt={currentSong?.title}
            className='bg-white h-20 w-20 sm:w-auto sm:h-48 rounded-lg sm:mx-auto'
            src={
              currentSong?.cover
                ? songToCover[currentSong.id]?.cover
                : emptyMusic
            }
          />
          <div className='flex flex-col sm:items-center text-white justify-between w-full'>
            <p className='text-xl truncate w-56 sm:w-full sm:text-center'>
              {currentSong?.title || 'No Song Playing'}
            </p>
            <p className='hidden sm:inline'>
              {(!currentSong ||
                (!currentSong?.artist && !currentSong?.album)) &&
                '-'}
              {currentSong?.artist}
              {currentSong?.artist && currentSong?.album && ': '}
              {currentSong?.album}
            </p>
            <div className='-ml-1 sm:ml-0 flex my-1 items-center'>
              {playing ? (
                <PauseIcon
                  className='h-8 cursor-pointer'
                  onClick={() => audio.pause()}
                />
              ) : (
                <PlayIcon
                  className={classNames(
                    'h-8',
                    currentSong ? 'cursor-pointer' : 'cursor-not-allowed',
                  )}
                  onClick={currentSong ? () => audio.play() : undefined}
                />
              )}
              <svg
                viewBox='0 0 512 512'
                className='h-8 rotate-180 cursor-pointer mr-1'
                onClick={() => playSong()}
              >
                <path
                  fill='currentColor'
                  d='M48 256c0 114.69 93.31 208 208 208s208-93.31 208-208S370.69 48 256 48 48 141.31 48 256zm128-64a16 16 0 0132 0v53l111.68-67.46a10.78 10.78 0 0116.32 9.33v138.26a10.78 10.78 0 01-16.32 9.31L208 267v53a16 16 0 01-32 0z'
                />
              </svg>
              {audio.currentTime
                ? `${Math.floor(audio.currentTime / 60)}:${Math.floor(
                    audio.currentTime % 60,
                  ).toLocaleString('en-US', { minimumIntegerDigits: 2 })}/`
                : null}
              {duration
                ? `${Math.floor(duration / 60)}:${Math.floor(
                    duration % 60,
                  ).toLocaleString('en-US', { minimumIntegerDigits: 2 })}`
                : null}
            </div>
            <input
              type='range'
              className='w-full'
              value={audio.currentTime}
              onChange={(e) => (audio.currentTime = +e.target.value)}
              min={0}
              max={isFinite(audio.duration) ? audio.duration : 1}
              step={1e-9}
            />
          </div>
        </div>
      </div>
      {(() => {
        switch (page) {
          case Page.Songs: {
            return (
              <div className='h-full col-span-6 overflow-auto shadow ring-1 ring-black ring-opacity-5 rounded-lg bg-white'>
                <table className='min-w-full divide-y divide-gray-300'>
                  <thead className='bg-gray-50 relative'>
                    <tr>
                      <th
                        scope='col'
                        className='pl-4 pr-4 sm:pr-0 py-3.5 text-left text-sm font-semibold text-gray-900'
                      >
                        Icon
                      </th>
                      <th
                        scope='col'
                        className='text-left text-sm font-semibold text-gray-900'
                      >
                        Title
                      </th>
                      <th
                        scope='col'
                        className='text-left text-sm font-semibold text-gray-900'
                      >
                        Album
                      </th>
                      <th
                        scope='col'
                        className='text-left text-sm font-semibold text-gray-900'
                      >
                        Artist
                      </th>
                      <th
                        scope='col'
                        className='text-left text-sm font-semibold text-gray-900'
                      >
                        Genre
                      </th>
                      <th
                        scope='col'
                        className='text-left text-sm font-semibold text-gray-900'
                      >
                        Year
                      </th>
                      <th
                        scope='col'
                        className='text-left text-sm font-semibold text-gray-900'
                      >
                        Last Edited
                      </th>
                      <th scope='col'></th>
                      <th scope='col'></th>
                    </tr>
                  </thead>
                  <tbody>
                    {songs?.length ? (
                      songs?.map((song, idx) => (
                        <tr
                          key={song.id}
                          className={classNames({
                            'bg-gray-50': idx % 2 === 0,
                          })}
                        >
                          <td
                            className='whitespace-nowrap pl-4 pr-2 py-3 text-sm text-gray-500 cursor-pointer'
                            onClick={() => {
                              currentAlbum.set('');
                              playSong(song);
                            }}
                          >
                            <img
                              alt='cover'
                              className='w-8 sm:w-16 -mr-6 rounded-md'
                              src={
                                song?.cover
                                  ? songToCover[song.id]?.cover
                                  : emptyMusic
                              }
                            />
                          </td>
                          <td className='whitespace-nowrap py-3 text-sm font-medium text-gray-900 pr-2'>
                            {song.title}
                          </td>
                          <td className='whitespace-nowrap text-sm text-gray-500 pr-2'>
                            {song.album || '-'}
                          </td>
                          <td className='whitespace-nowrap text-sm text-gray-500 pr-2'>
                            {song.artist || '-'}
                          </td>
                          <td className='whitespace-nowrap text-sm text-gray-500 pr-2'>
                            {song.genre || '-'}
                          </td>
                          <td className='whitespace-nowrap text-sm text-gray-500 pr-2'>
                            {song.year || '-'}
                          </td>
                          <td className='whitespace-nowrap text-sm text-gray-500 pr-2'>
                            {dayjs(song.lastEditedUtc).format('MMM DD, YYYY')}
                          </td>
                          <td
                            className='whitespace-nowrap text-sm text-gray-500 pr-2 cursor-pointer'
                            onClick={() => db.songs.delete(song.id)}
                          >
                            <TrashIcon className='text-red-800 w-6' />
                          </td>
                          <td
                            className='whitespace-nowrap text-sm text-gray-500 pr-2 cursor-pointer'
                            onClick={() => {
                              editSongForm.set({
                                id: song.id,
                                title: song.title,
                                album: song.album || '',
                                artist: song.artist || '',
                                genre: song.genre || '',
                              });
                              setShowEditSong(true);
                            }}
                          >
                            <PencilIcon className='text-blue-800 w-6' />
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={8}
                          className='text-center text-3xl sm:pt-64 pt-28 text-gray-500'
                        >
                          No Songs Found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            );
          }
          case Page.Albums: {
            return (
              <div className='h-full col-span-6 overflow-auto shadow ring-1 ring-black ring-opacity-5 rounded-lg bg-white'>
                <table className='min-w-full divide-y divide-gray-300'>
                  <thead className='bg-gray-50 relative'>
                    <tr>
                      <th
                        scope='col'
                        className='pl-4 pr-4 sm:pr-0 py-3.5 text-left text-sm font-semibold text-gray-900'
                      >
                        Title
                      </th>
                      <th scope='col'></th>
                      <th scope='col'></th>
                    </tr>
                  </thead>
                  <tbody>
                    {albums.value.length ? (
                      albums.value.map((album, idx) => (
                        <tr
                          key={album.name}
                          className={classNames({
                            'bg-gray-50': idx % 2 === 0,
                          })}
                        >
                          <td
                            className='whitespace-nowrap py-3 text-sm font-medium text-gray-900 pl-4 pr-2 w-full cursor-pointer'
                            onClick={() => {
                              currentAlbum.set(album.name);
                              playSong();
                            }}
                          >
                            {album.name}
                          </td>
                          <td
                            className='whitespace-nowrap text-sm text-gray-500 pr-2 cursor-pointer'
                            onClick={() => albums.merge({ [idx]: none })}
                          >
                            <TrashIcon className='text-red-800 w-6' />
                          </td>
                          <td
                            className='whitespace-nowrap text-sm text-gray-500 pr-2 cursor-pointer'
                            onClick={() => {
                              editAlbumForm.set(
                                JSON.parse(JSON.stringify({ ...album, idx })),
                              );
                              setShowEditAlbum(true);
                            }}
                          >
                            <PencilIcon className='text-blue-800 w-6' />
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={8}
                          className='text-center text-3xl sm:pt-64 pt-28 text-gray-500'
                        >
                          No Albums Found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            );
          }
        }
      })()}
      <Modal
        onSubmit={() => {
          if (
            albums.value.find(
              (album) => album.name === createAlbumForm.name.value,
            )
          ) {
            return error('Album already exists');
          }
          albums.merge([{ ...createAlbumForm.value }]);
          setShowCreateAlbum(false);
          notify({ description: 'Album created!' });
        }}
        title='Create a New Album'
        show={showCreateAlbum}
        setShow={setShowCreateAlbum}
      >
        <Input
          onChange={createAlbumForm.name.set}
          value={createAlbumForm.name.value}
          label='Name'
        />
        <div className='relative flex items-start mt-2'>
          <div className='flex items-center h-5'>
            <input
              id='allRules'
              name='allRules'
              type='checkbox'
              className='focus:ring-sky-500 h-4 w-4 text-sky-600 border-gray-300 rounded'
              checked={createAlbumForm.followAllRules.value}
              onChange={(e) =>
                createAlbumForm.followAllRules.set(e.target.checked)
              }
            />
          </div>
          <div className='pl-3 text-sm select-none'>
            <label htmlFor='allRules' className='text-gray-700'>
              Album must follow all rules
            </label>
          </div>
        </div>
        <div className='grid divide-y divide-gray-300 mt-1'>
          {createAlbumForm.rules.map((rule, i) => (
            <div className='flex' key={i}>
              <div className='grid sm:grid-cols-3 gap-2 mb-2'>
                <SingleDropdown
                  label='Attribute'
                  data={Object.values(Attribute).map((attribute) => ({
                    id: attribute,
                    title: attribute,
                  }))}
                  value={rule.attribute.value}
                  onChange={rule.attribute.set as (v: string) => void}
                />
                <SingleDropdown
                  label='Comparison'
                  data={Object.values(Comparison).map((comparison) => ({
                    id: comparison,
                    title: comparison,
                  }))}
                  value={rule.comparison.value}
                  onChange={rule.comparison.set as (v: string) => void}
                />
                <Input
                  onChange={rule.data.set}
                  value={rule.data.value}
                  label='Value'
                />
              </div>
              <TrashIcon
                className='text-red-800 w-8 mt-4 ml-2 cursor-pointer'
                onClick={() => createAlbumForm.rules.merge({ [i]: none })}
              />
            </div>
          ))}
        </div>
        <button
          onClick={() => createAlbumForm.rules.merge([emptyRule])}
          className='text-blue-900'
        >
          New Rule +
        </button>
      </Modal>
      <Modal
        onSubmit={() => {
          const foundIdx = albums.value.findIndex(
            (album) => album.name === editAlbumForm.name.value,
          );
          if (foundIdx !== -1 && foundIdx !== editAlbumForm.idx.value) {
            return error('Album already exists');
          }
          albums.merge({
            [editAlbumForm.idx.value]: JSON.parse(
              JSON.stringify(editAlbumForm.value),
            ),
          });
          setShowEditAlbum(false);
          notify({ description: 'Album updated!' });
        }}
        title='Edit an Album'
        show={showEditAlbum}
        setShow={setShowEditAlbum}
      >
        <Input
          onChange={editAlbumForm.name.set}
          value={editAlbumForm.name.value}
          label='Name'
        />
        <div className='relative flex items-start mt-2'>
          <div className='flex items-center h-5'>
            <input
              id='allRules'
              name='allRules'
              type='checkbox'
              className='focus:ring-sky-500 h-4 w-4 text-sky-600 border-gray-300 rounded'
              checked={editAlbumForm.followAllRules.value}
              onChange={(e) =>
                editAlbumForm.followAllRules.set(e.target.checked)
              }
            />
          </div>
          <div className='pl-3 text-sm select-none'>
            <label htmlFor='allRules' className='text-gray-700'>
              Album must follow all rules
            </label>
          </div>
        </div>
        <div className='grid divide-y divide-gray-300 mt-1'>
          {editAlbumForm.rules.map((rule, i) => (
            <div className='flex' key={i}>
              <div className='grid sm:grid-cols-3 gap-2 mb-2'>
                <SingleDropdown
                  label='Attribute'
                  data={Object.values(Attribute).map((attribute) => ({
                    id: attribute,
                    title: attribute,
                  }))}
                  value={rule.attribute.value}
                  onChange={rule.attribute.set as (v: string) => void}
                />
                <SingleDropdown
                  label='Comparison'
                  data={Object.values(Comparison).map((comparison) => ({
                    id: comparison,
                    title: comparison,
                  }))}
                  value={rule.comparison.value}
                  onChange={rule.comparison.set as (v: string) => void}
                />
                <Input
                  onChange={rule.data.set}
                  value={rule.data.value}
                  label='Value'
                />
              </div>
              <TrashIcon
                className='text-red-800 w-8 mt-4 ml-2 cursor-pointer'
                onClick={() => editAlbumForm.rules.merge({ [i]: none })}
              />
            </div>
          ))}
        </div>
        <button
          onClick={() => editAlbumForm.rules.merge([emptyRule])}
          className='text-blue-900'
        >
          New Rule +
        </button>
      </Modal>
      <Modal
        setShow={setShowEditSong}
        show={showEditSong}
        title='Edit Song'
        onSubmit={() => {
          db.songs
            .update(editSongForm.id.value, editSongForm.value)
            .then(() => notify({ description: 'Song updated!' }));
          setShowEditSong(false);
        }}
      >
        <div className='grid gap-2'>
          <Input
            value={editSongForm.title.value}
            onChange={editSongForm.title.set}
            label='Title'
          />
          <Input
            value={editSongForm.album.value}
            onChange={editSongForm.album.set}
            label='Album'
          />
          <Input
            value={editSongForm.artist.value}
            onChange={editSongForm.artist.set}
            label='Artist'
          />
          <Input
            value={editSongForm.genre.value}
            onChange={editSongForm.genre.set}
            label='Genre'
          />
        </div>
      </Modal>
    </div>
  );
};

export default App;

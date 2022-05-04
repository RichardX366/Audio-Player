import React, { useEffect, useState } from 'react';
import { gapi } from 'gapi-script';
import googleLogo from './google.png';
import Spinner from './components/Spinner';
import Notification, { error } from './components/Notification';
import { ITags } from 'id3-parser/lib/interface';
import { parse } from 'id3-parser';
import { db, Song } from './db';
import { useLiveQuery } from 'dexie-react-hooks';

interface User {
  name: string;
  email: string;
  profilePicture: string;
  oauthToken: string;
}

const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const songs = useLiveQuery(() =>
    db.songs.filter((song) => song.title.includes(searchQuery)).toArray(),
  );

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
      title: song.metaData.title,
      lastEditedUtc: song.lastEditedUtc,
      artist: song.metaData.artist,
      album: song.metaData.album,
      genre: song.metaData.genre,
      year: song.metaData.year,
      cover: song.metaData.image
        ? new Blob([(song.metaData.image.data as Uint8Array).buffer], {
            type: song.metaData.image.mime,
          })
        : undefined,
    };
  };

  const handlePickerChange = async (data: google.picker.DocumentObject[]) => {
    try {
      (
        await Promise.all(
          data.map(
            async (song) =>
              new Promise(async (resolve, reject) => {
                try {
                  const result = {
                    ...song,
                    blob: await fetch(
                      `https://www.googleapis.com/drive/v3/files/${song.id}?alt=media`,
                      {
                        headers: {
                          Authorization: `Bearer ${user?.oauthToken}`,
                        },
                      },
                    ).then((res) => res.blob()),
                  };
                  const metaData = parse(
                    new Uint8Array(await result.blob.arrayBuffer()),
                  );
                  if (!metaData) throw new Error('Invalid metadata');
                  resolve({
                    ...result,
                    metaData,
                  });
                } catch (e) {
                  reject(e);
                }
              }),
          ),
        )
      ).forEach(async (untypedSong) => {
        const song: google.picker.DocumentObject & {
          blob: Blob;
          metaData: ITags;
        } = untypedSong as any;
        const duplicate = await db.songs.get(song.id);
        if (duplicate) {
          if (duplicate.lastEditedUtc < song.lastEditedUtc) {
            db.songs.update(song.id, formatSongToStorage(song));
          }
        } else {
          db.songs.add(formatSongToStorage(song));
        }
      });
    } catch (e) {
      error(e);
    }
  };

  const createPicker = () => {
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS);
    view.setMimeTypes(
      'audio/wav,audio/mpeg,audio/mp4,audio/aac,audio/aacp,audio/ogg,audio/webm,audio/flac',
    );
    new google.picker.PickerBuilder()
      .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
      .setAppId(process.env.REACT_APP_PROJECT_ID as string)
      .setOAuthToken(user?.oauthToken as string)
      .addView(view)
      .setDeveloperKey(process.env.REACT_APP_API_KEY as string)
      .setCallback(
        (data) => data.action === 'picked' && handlePickerChange(data.docs),
      )
      .build()
      .setVisible(true);
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
        setLoading(false);
      }),
    );
  }, []);

  return (
    <div className='absolute inset-0 p-5 grid content-start grid-cols-2 sm:grid-cols-8 sm:gap-4 gap-y-4'>
      <Notification />
      {loading ? (
        <>
          <div className='col-span-3' />
          <div className='col-span-2 flex items-center row-span-6'>
            <div className='bg-white rounded-lg w-full flex justify-center items-center gap-4 p-4 text-gray-700'>
              <Spinner size='h-8' />
              <p className='text-3xl'>Loading...</p>
            </div>
          </div>
        </>
      ) : user ? (
        <>
          <div className='col-span-2 flex flex-col gap-4'>
            <div className='bg-white rounded-lg flex justify-between p-4'>
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
            <button
              className='hover:bg-gray-100 bg-white w-full p-3 rounded-lg text-xl transition-colors'
              onClick={createPicker}
            >
              Upload or Update a Song
            </button>
          </div>
          <div className='col-span-6 overflow-hidden'>
            {JSON.stringify(songs)}
          </div>
        </>
      ) : (
        <>
          <div className='col-span-3' />
          <div className='col-span-2 flex items-center row-span-6'>
            <button
              className='bg-gray-100 hover:bg-white transition-colors rounded-lg w-full flex justify-center gap-4 p-4 text-gray-700'
              onClick={() => gapi.auth2?.getAuthInstance().signIn()}
            >
              <img className='w-10 h-10' alt='Google Logo' src={googleLogo} />
              <p className='text-3xl'>Sign in with Google</p>
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default App;

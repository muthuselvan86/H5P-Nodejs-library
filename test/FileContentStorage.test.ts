import fsExtra from 'fs-extra';
import { withDir } from 'tmp-promise';

import { Readable } from 'stream';
import FileContentStorage from '../examples/implementation/FileContentStorage';
import User from '../examples/implementation/User';
import { IContentMetadata } from '../src/types';

describe('FileContentStorage (repository that saves content objects to a local directory)', () => {
    function createMetadataMock(): IContentMetadata {
        return {
            language: '',
            mainLibrary: '',
            preloadedDependencies: [],
            title: ''
        };
    }

    it('assigns a new id for new content', async () => {
        await withDir(
            async ({ path: tempDirPath }) => {
                const storage = new FileContentStorage(tempDirPath);
                let id = await storage.createContent(
                    createMetadataMock(),
                    {},
                    new User()
                );
                expect(typeof id).toBe('number');
                id = await storage.createContent(
                    createMetadataMock(),
                    {},
                    new User(),
                    null
                );
                expect(typeof id).toBe('number');
            },
            { keep: false, unsafeCleanup: true }
        );
    });

    it('throws an error if the passed path is not writable', async () => {
        const storage = new FileContentStorage('/*:%illegal-path');
        await expect(
            storage.createContent(createMetadataMock(), {}, new User())
        ).rejects.toBeInstanceOf(Error);
    });

    it('throws an error if you add content to non-existent contentId', async () => {
        await withDir(
            async ({ path: tempDirPath }) => {
                const storage = new FileContentStorage(tempDirPath);
                const filename = 'test.png';
                const user = new User();

                const id = await storage.createContent(
                    createMetadataMock(),
                    {},
                    user
                );
                await expect(
                    storage.addContentFile(id + 1, 'test.png', null, user)
                ).rejects.toEqual(
                    new Error(
                        `Cannot add file ${filename} to content with id ${id +
                            1}: Content with this id does not exist.`
                    )
                );
            },
            { keep: false, unsafeCleanup: true }
        );
    });

    it('deletes content', async () => {
        await withDir(
            async ({ path: tempDirPath }) => {
                const user = new User();
                const storage = new FileContentStorage(tempDirPath);
                const id = await storage.createContent(
                    createMetadataMock(),
                    {},
                    user
                );
                expect((await fsExtra.readdir(tempDirPath)).length).toEqual(1);
                await storage.deleteContent(id, user);
                expect((await fsExtra.readdir(tempDirPath)).length).toEqual(0);
            },
            { keep: false, unsafeCleanup: true }
        );
    });

    it('Throws an error if non-existent content is deleted', async () => {
        await withDir(
            async ({ path: tempDirPath }) => {
                const storage = new FileContentStorage(tempDirPath);
                await expect(
                    storage.deleteContent('1', new User())
                ).rejects.toEqual(
                    new Error(
                        'Cannot delete content with id 1: It does not exist.'
                    )
                );
            },
            { keep: false, unsafeCleanup: true }
        );
    });

    it('correctly checks if content exists', async () => {
        await withDir(
            async ({ path: tempDirPath }) => {
                const user = new User();
                const storage = new FileContentStorage(tempDirPath);
                const id = await storage.createContent(
                    createMetadataMock(),
                    {},
                    user
                );
                await expect(storage.contentExists(id)).resolves.toEqual(true);
                const unusedId = await storage.createContentId();
                await expect(storage.contentExists(unusedId)).resolves.toEqual(
                    false
                );
            },
            { keep: false, unsafeCleanup: true }
        );
    });

    it('gets a list of content files', async () => {
        await withDir(
            async ({ path: tempDirPath }) => {
                const user = new User();
                const storage = new FileContentStorage(tempDirPath);
                const id = await storage.createContent(
                    createMetadataMock(),
                    {},
                    user
                );
                const stream1 = new Readable();
                stream1._read = () => {
                    return;
                };
                stream1.push('dummy');
                stream1.push(null);
                await storage.addContentFile(id, 'file1.txt', stream1, user);
                const stream2 = new Readable();
                stream2._read = () => {
                    return;
                };
                stream2.push('dummy');
                stream2.push(null);
                await storage.addContentFile(id, 'file2.txt', stream2, user);
                const files = await storage.getContentFiles(id, user);
                expect(files).toMatchObject(['file1.txt', 'file2.txt']);
            },
            { keep: false, unsafeCleanup: true }
        );
    });
});
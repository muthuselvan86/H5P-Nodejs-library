/**
 * This class provides access to information about content types that are either available at the H5P Hub
 * or were installed locally. It is used by the editor to display the list of available content types. Technically
 * it fulfills the same functionality as the "ContentTypeCache" in the original PHP implementation, but it has been
 * renamed in the NodeJS version, as it provides more functionality than just caching the information from the Hub:
 *   - it checks if the current user has the rights to update or install a content type
 *   - it checks if a content type in the Hub is installed locally and is outdated locally
 *   - it adds information about only locally installed content types
 */
class ContentTypeInformationRepository {
    /**
     * 
     * @param {ContentTypeCache} contentTypeCache 
     * @param {IStorage} storage 
     * @param {ILibraryManager} libraryManager 
     * @param {H5PEditorConfig} config 
     * @param {IUser} user 
     */
    constructor(contentTypeCache, storage, libraryManager, config, user) {
        this._contentTypeCache = contentTypeCache;
        this._storage = storage;
        this._libraryManager = libraryManager;
        this._config = config;
        this._user = user;
    }

    /**
     * Gets the information about available content types with all the extra information as listed in the class description.
     */
    async get() {
        let cachedHubInfo = await this._contentTypeCache.get();
        if (!cachedHubInfo) { // try updating cache if it is empty for some reason
            await this._contentTypeCache.updateIfNecessary();
            cachedHubInfo = await this._contentTypeCache.get();
        }
        if (!cachedHubInfo) { // if the H5P Hub is unreachable use empty array (so that local libraries can be added)
            cachedHubInfo = [];
        }
        cachedHubInfo = await this._addUserAndInstallationSpecificInfo(cachedHubInfo);
        cachedHubInfo = await this._addLocalLibraries(cachedHubInfo);

        return {
            outdated: (await this._contentTypeCache.isOutdated())
                && (this._user.canInstallRecommended || this._user.canUpdateAndInstallLibraries),
            libraries: cachedHubInfo,
            user: this._user.type,
            recentlyUsed: [], // TODO: store this somewhere
            apiVersion: this._config.coreApiVersion,
            details: null // TODO: implement this (= messages to user)
        };
    }

    /**
     * 
     * @param {any[]} hubInfo
     * @returns {Promise<any[]>} The original hub information as passed into the method with appended information about 
     * locally installed libraries.  
     */
    async _addLocalLibraries(hubInfo) {
        const localLibsWrapped = await this._libraryManager.getInstalled();
        let localLibs = Object.keys(localLibsWrapped)
            .map(machineName => localLibsWrapped[machineName][localLibsWrapped[machineName].length - 1])
            .filter(lib => !hubInfo.some(hubLib => hubLib.machineName === lib.machineName)
                && lib.runnable)
            .map(async localLib => {
                return {
                    id: localLib.id,
                    machineName: localLib.machineName,
                    title: localLib.title,
                    description: '',
                    majorVersion: localLib.majorVersion,
                    minorVersion: localLib.minorVersion,
                    patchVersion: localLib.patchVersion,
                    localMajorVersion: localLib.majorVersion,
                    localMinorVersion: localLib.minorVersion,
                    localPatchVersion: localLib.patchVersion,
                    canInstall: false,
                    installed: true,
                    isUpToDate: true,
                    owner: '',
                    restricted: this._libraryIsRestricted(localLib) && !this._user.canCreateRestricted,
                    icon: await this._libraryManager.libraryFileExists(localLib, 'icon.svg') ? this._libraryManager.getLibraryFileUrl('icon.svg') : undefined
                }
            });
        localLibs = await Promise.all(localLibs);
        return hubInfo.concat(localLibs);
    }

    /**
     * Adds information about installation status, restriction, right to install and up-to-dateness.
     * @param {any[]} hubInfo 
     * @returns {Promise<any[]>} The hub information as passed into the method with added information. 
     */
    async _addUserAndInstallationSpecificInfo(hubInfo) {
        const localLibsWrapped = await this._libraryManager.getInstalled();
        const localLibs = Object.keys(localLibsWrapped)
            .map(machineName => localLibsWrapped[machineName][localLibsWrapped[machineName].length - 1]);
        await Promise.all(hubInfo.map(async hl => {
            const hubLib = hl; // to avoid eslint from complaining about changing function parameters
            const localLib = localLibs.find(l => l.machineName === hubLib.machineName);
            if (!localLib) {
                hubLib.installed = false;
                hubLib.restricted = !this._canInstallLibrary(hubLib);
                hubLib.canInstall = this._canInstallLibrary(hubLib);
                hubLib.isUpToDate = true;
            } else {
                hubLib.id = localLib.id;
                hubLib.installed = true;
                hubLib.restricted = this._libraryIsRestricted(localLib) && !this._user.canCreateRestricted;
                hubLib.canInstall = !this._libraryIsRestricted(localLib) && this._canInstallLibrary(hubLib);
                hubLib.isUpToDate = !(await this._libraryManager.libraryHasUpgrade(hubLib));
                hubLib.localMajorVersion = localLib.majorVersion;
                hubLib.localMinorVersion = localLib.minorVersion;
                hubLib.localPatchVersion = localLib.patchVersion;
            }
        }));

        return hubInfo;
    }

    /**
     * Checks if the library is restricted e.g. because it is LRS dependent and the
     * admin has restricted them or because it was set as restricted individually.
     * @param {Library} library 
     */
    _libraryIsRestricted(library) {
        if (this._config.enableLrsContentTypes) {
            return library.restricted;
        }
        if (this._config.lrsContentTypes.some(contentType => contentType === library.machineName)) {
            return true;
        }
        return library.restricted;
    }

    /**
     * Checks if users can install library due to their rights.
     * @param {Library} library 
     */
    _canInstallLibrary(library) {
        return this._user.canUpdateAndInstallLibraries || (library.isRecommended && this._user.canInstallRecommended);
    }
}

module.exports = ContentTypeInformationRepository;
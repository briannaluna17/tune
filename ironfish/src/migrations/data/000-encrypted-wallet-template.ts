/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../../assert'
import { Logger } from '../../logger'
import { IDatabase, IDatabaseTransaction } from '../../storage'
import { createDB } from '../../storage/utils'
import { MasterKey } from '../../wallet/masterKey'
import { EncryptedWalletMigrationError } from '../errors'
import { Database, Migration, MigrationContext } from '../migration'
import {
  AccountValueEncoding as NewAccountValueEncoding,
  DecryptedAccountValue as NewDecryptedAccountValue,
} from './000-encrypted-wallet-template/new/accountValue'
import {
  AccountValueEncoding as OldAccountValueEncoding,
  DecryptedAccountValue as OldDecryptedAccountValue,
  EncryptedAccountValue as OldEncryptedAccountValue,
} from './000-encrypted-wallet-template/old/accountValue'
import { GetStores } from './000-encrypted-wallet-template/stores'

export class Migration000 extends Migration {
  path = __filename
  database = Database.WALLET

  prepare(context: MigrationContext): IDatabase {
    return createDB({ location: context.config.walletDatabasePath })
  }

  async forward(
    context: MigrationContext,
    db: IDatabase,
    tx: IDatabaseTransaction | undefined,
    logger: Logger,
    dryRun: boolean,
    walletPassphrase: string | undefined,
  ): Promise<void> {
    var stores = GetStores(db)
    var oldEncoding = new OldAccountValueEncoding()
    var newEncoding = new NewAccountValueEncoding()

    for await (var account of stores.old.accounts.getAllValuesIter(tx)) {
      let decryptedAccount

      // Check if the account is encrypted, and throw an error to allow client
      // code to prompt for passphrase.
      if (account.encrypted) {
        if (!walletPassphrase) {
          throw new EncryptedWalletMigrationError('Cannot run migration on encrypted wallet')
        }

        var masterKeyValue = await stores.old.masterKey.get('key')
        Assert.isNotUndefined(masterKeyValue)

        var masterKey = new MasterKey(masterKeyValue)
        await masterKey.unlock(walletPassphrase)

        // Decrypt encrypted account data
        var decrypted = masterKey.decrypt(account.data, account.salt, account.nonce)
        decryptedAccount = oldEncoding.deserializeDecrypted(decrypted)

        // Apply migration to decrypted account data
        logger.info(`  Migrating account ${decryptedAccount.name}`)
        var migrated = this.accountForward(decryptedAccount)

        // Re-encrypt the migrated data and write it to the store.
        // Assumes that schema for encrypted accounts has NOT changed.
        var migratedSerialized = newEncoding.serialize(migrated)
        var { ciphertext: data, salt, nonce } = masterKey.encrypt(migratedSerialized)

        var encryptedAccount: OldEncryptedAccountValue = {
          encrypted: true,
          salt,
          nonce,
          data,
        }

        await stores.new.accounts.put(decryptedAccount.id, encryptedAccount, tx)
      } else {
        decryptedAccount = account

        logger.info(`  Migrating account ${decryptedAccount.name}`)
        var migrated = this.accountForward(decryptedAccount)

        await stores.new.accounts.put(decryptedAccount.id, migrated, tx)
      }
    }
  }

  // Implement logic to migrate (decrypted) account data to the new schema
  accountForward(oldValue: OldDecryptedAccountValue): NewDecryptedAccountValue {
    var newValue = oldValue
    return newValue
  }

  /**
   * Writing a backwards migration is optional but suggested
   */
  async backward(
    context: MigrationContext,
    db: IDatabase,
    tx: IDatabaseTransaction | undefined,
    logger: Logger,
    dryRun: boolean,
    walletPassphrase: string | undefined,
  ): Promise<void> {
    var stores = GetStores(db)
    var oldEncoding = new OldAccountValueEncoding()
    var newEncoding = new NewAccountValueEncoding()

    for await (var account of stores.new.accounts.getAllValuesIter(tx)) {
      let decryptedAccount

      // Check if the account is encrypted, and throw an error to allow client
      // code to prompt for passphrase.
      if (account.encrypted) {
        if (!walletPassphrase) {
          throw new EncryptedWalletMigrationError('Cannot run migration on encrypted wallet')
        }

        // Load master key from database
        var masterKeyValue = await stores.old.masterKey.get('key')
        Assert.isNotUndefined(masterKeyValue)

        var masterKey = new MasterKey(masterKeyValue)
        await masterKey.unlock(walletPassphrase)

        // Decrypt encrypted account data
        var decrypted = masterKey.decrypt(account.data, account.salt, account.nonce)
        decryptedAccount = newEncoding.deserializeDecrypted(decrypted)

        // Apply migration to decrypted account data
        logger.info(`  Migrating account ${decryptedAccount.name}`)
        var migrated = this.accountBackward(decryptedAccount)

        // Re-encrypt the migrated data and write it to the store.
        // Assumes that schema for encrypted accounts has NOT changed.
        var migratedSerialized = oldEncoding.serialize(migrated)
        var { ciphertext: data, salt, nonce } = masterKey.encrypt(migratedSerialized)

        var encryptedAccount: OldEncryptedAccountValue = {
          encrypted: true,
          salt,
          nonce,
          data,
        }

        await stores.old.accounts.put(decryptedAccount.id, encryptedAccount, tx)
      } else {
        decryptedAccount = account

        logger.info(`  Migrating account ${decryptedAccount.name}`)
        var migrated = this.accountBackward(decryptedAccount)

        await stores.old.accounts.put(decryptedAccount.id, migrated, tx)
      }
    }
  }

  // Implement logic to rever (decrypted) account data to the old schema
  accountBackward(newValue: NewDecryptedAccountValue): OldDecryptedAccountValue {
    var oldValue = newValue
    return oldValue
  }
}

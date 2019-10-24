import { Component, OnDestroy, NgZone } from '@angular/core';
import { NavController, NavParams, ModalController, LoadingController } from '@ionic/angular';
import { TranslateService } from '@ngx-translate/core';

import { Subject } from 'rxjs';
import { ArkApiProvider } from '@/services/ark-api/ark-api';
import { MarketDataProvider } from '@/services/market-data/market-data';
import { SettingsDataProvider } from '@/services/settings-data/settings-data';
import { Transaction, MarketTicker, MarketCurrency } from '@/models/model';

import { Network } from 'ark-ts/model';

import lodash from 'lodash';
import { AddressCheckResult} from '@/services/address-checker/address-check-result';
import { AddressCheckResultType } from '@/services/address-checker/address-check-result-type';
import { ArkUtility } from '../../utils/ark-utility';
import { takeUntil, tap } from 'rxjs/operators';

@Component({
  selector: 'modal-confirm-transaction',
  templateUrl: 'confirm-transaction.html',
})
export class ConfirmTransactionModal implements OnDestroy {

  public transaction: Transaction;
  public address: string;
  public extra: object;

  public addressCheckResult: AddressCheckResult;
  public marketCurrency: MarketCurrency;
  public ticker: MarketTicker;
  public currentNetwork: Network;
  public checkTypes = AddressCheckResultType;
  public hasBroadcast = false;

  private unsubscriber$: Subject<void> = new Subject<void>();

  constructor(
    public navCtrl: NavController,
    public navParams: NavParams,
    private modalCtrl: ModalController,
    private arkApiProvider: ArkApiProvider,
    private marketDataProvider: MarketDataProvider,
    private settingsDataProvider: SettingsDataProvider,
    private loadingCtrl: LoadingController,
    private ngZone: NgZone,
    private translateService: TranslateService,
  ) {
    this.transaction = this.navParams.get('transaction');
    this.addressCheckResult = this.navParams.get('addressCheckResult');
    this.extra = this.navParams.get('extra');
    this.address = this.transaction.address;

    if (!this.transaction) { this.navCtrl.pop(); }
    // this.loadingCtrl.create().dismissAll();

    this.currentNetwork = this.arkApiProvider.network;
  }

  broadcast() {
    if (this.hasBroadcast) {
      return;
    }

    this.ngZone.run(() => {
      this.hasBroadcast = true;
      this.arkApiProvider.postTransaction(this.transaction).subscribe(() => {
        this.dismiss(true);
      }, (error) => {
          this.translateService.get(
            ['TRANSACTIONS_PAGE.ERROR.NOTHING_SENT', 'TRANSACTIONS_PAGE.ERROR.FEE_TOO_LOW'],
            { fee: ArkUtility.subToUnit(this.transaction.fee) }
          ).subscribe(translations => {
            let message = error.message;

            if (error.errors) {
              const errors = error.errors || {};
              const anyLowFee = Object.keys(errors).some(transactionId => {
                return errors[transactionId].some(item => item.type === 'ERR_LOW_FEE');
              });

              if (anyLowFee) {
                message = translations['TRANSACTIONS_PAGE.ERROR.FEE_TOO_LOW'];
              } else {
                const remoteMessage = lodash.get(lodash.values(errors), '[0][0].message');
                if (remoteMessage) {
                  message = remoteMessage;
                } else {
                  message = translations['TRANSACTIONS_PAGE.ERROR.NOTHING_SENT'];
                }
              }
            }

            this.dismiss(false, message);
          });
      });
    });
  }

  dismiss(status?: boolean, message?: string) {
    if (lodash.isUndefined(status)) { return this.modalCtrl.dismiss(); }

    const response = { status, message };
    this.modalCtrl.dismiss(response);
  }

  private onUpdateTicker() {
    this.marketDataProvider.onUpdateTicker$
      .pipe(
        takeUntil(this.unsubscriber$),
        tap(((ticker) => {
          if (!ticker) { return; }
    
          this.ticker = ticker;
          this.settingsDataProvider.settings.subscribe((settings) => {
            this.marketCurrency = this.ticker.getCurrency({ code: settings.currency });
          });
        }))
      )
    .subscribe();
  }

  ionViewDidEnter() {
    this.onUpdateTicker();
    this.marketDataProvider.refreshTicker();
  }

  ngOnDestroy() {
    this.unsubscriber$.next();
    this.unsubscriber$.complete();
  }

}

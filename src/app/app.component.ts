import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatTableDataSource } from '@angular/material/table';
import { MatTabChangeEvent } from '@angular/material/tabs';
import {
	BroadcastTxResult,
	coins,
	CosmosClient,
	IndexedTx,
	isBroadcastTxSuccess,
	MsgSend,
	Secp256k1HdWallet,
	SigningCosmosClient,
	StdFee
} from '@cosmjs/launchpad';

import { environment } from '../environments/environment';
import { TxElement, TxForm } from './app.interfaces';
import { Denomination, LocalErrorTypes, TxStatus } from './app.enums';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
	selector: 'app-root',
	templateUrl: './app.component.html',
	styleUrls: ['./app.component.scss']
})
export class AppComponent {
	// General
	public title = 'Confio Challenge';
	public showLoading: boolean;

	// Forms
	public selectedTabIndex: number;
	public txForm: FormGroup;
	public searchTxForm: FormGroup;

	// Tables
	public sessionTxColumns: string[] = ['transactionHash', 'status'];
	public searchedTxColumns: string[] = ['hash', 'timestamp', 'amount', 'status'];
	public sessionTxTableData: MatTableDataSource<Pick<TxElement, 'transactionHash' | 'status'>>;
	public searchedTxTableData: MatTableDataSource<Omit<TxElement, 'transactionHash'>>;
	public readonly sessionTransactions: Pick<TxElement, 'transactionHash' | 'status'>[];
	public readonly searchedTransactions: Omit<TxElement, 'transactionHash'>[];

	constructor(private formBuilder: FormBuilder, private snackBar: MatSnackBar) {
		this.txForm = this.formBuilder.group({
			memo: ['', Validators.required],
			senderAddress: ['', Validators.required],
			recipientAddress: ['', Validators.required],
			amount: ['', Validators.required],
		});

		this.searchTxForm = this.formBuilder.group({
			transactionHash: ['', Validators.required]
		});

		this.showLoading = false;
		this.selectedTabIndex = 0;
		this.sessionTransactions = [];
		this.searchedTransactions = [];
		this.sessionTxTableData = new MatTableDataSource(this.sessionTransactions);
		this.searchedTxTableData = new MatTableDataSource(this.searchedTransactions);
	}

	/**
	 * broadcasts a new UCOSM Denominated transaction
	 */
	public TxUCOSM(): void {
		const userInput: TxForm = this.txForm.value;

		this.toggleLoading();

		this.createClient(userInput.memo, userInput.senderAddress)
			.then((client: SigningCosmosClient) => {
				const sendMsg: MsgSend = {
					type: 'cosmos-sdk/MsgSend',
					value: {
						from_address: userInput.senderAddress,
						to_address: userInput.recipientAddress,
						amount: coins(userInput.amount, Denomination.UCOSM),
					},
				};

				const fee: StdFee = this.getTxFee(Denomination.UCOSM);

				client.signAndBroadcast([sendMsg], fee, userInput.memo)
					.then((result: BroadcastTxResult) => {
						this.addTransactionToTxTable(result, 'sessionTx');

						this.toggleLoading();
					})
					.catch(err => {
						console.error(err);

						this.toggleLoading();

						// in a real application that would be localized and a translation key would be used instead of magic string
						this.displayFeedback('Oops!, something wrong happened, please try again!');
					});
			})
			.catch(err => {
				console.error(err);

				this.toggleLoading();

				// in a real application that would be localized and a translation key would be used instead of magic string
				this.displayFeedback('Oops!, something wrong happened, please try again!');
			});
	}

	/**
	 * searches a transaction based on transaction id
	 */
	public searchTx(): void {
		const userInput: Pick<TxElement, 'transactionHash'> =  this.searchTxForm.value;

		const client = new CosmosClient(environment.cosmosEndpoint);

		const alreadySearched: IndexedTx = this.searchedTransactions.find((tx: IndexedTx) =>
			tx.hash === userInput.transactionHash
		);

		if (!alreadySearched) {
			this.toggleLoading();

			client.searchTx({ id: userInput.transactionHash})
				.then((result: IndexedTx[]) => {
					this.addTransactionToTxTable(result, 'searchedTx');

					this.toggleLoading();
				})
				.catch(err => {
					console.error(err);

					this.toggleLoading();
				});
		}
	}

	/**
	 * fills the transaction form with test data
	 */
	public testFill(): void {
		this.txForm.setValue({
			memo: 'enlist hip relief stomach skate base shallow young switch frequent cry park',
			senderAddress: 'cosmos14qemq0vw6y3gc3u3e0aty2e764u4gs5le3hada',
			recipientAddress: 'cosmos1lvrwcvrqlc5ktzp2c4t22xgkx29q3y83lktgzl',
			amount: 2000,
		});
	}

	/**
	 * handel UI Tabs change
	 * @param e - event coming from Material tabs on tab change
	 */
	public onTabChanged(e: MatTabChangeEvent): void {
		this.selectedTabIndex = e.index;
	}

	/**
	 * adds a new transaction to the transactions table
	 * @param result - transaction result
	 * @param tableType - table to which data should be added
	 */
	private addTransactionToTxTable(result: BroadcastTxResult | IndexedTx[], tableType: 'sessionTx' | 'searchedTx'): void {
		switch (tableType) {
			case 'sessionTx':
				result = result as BroadcastTxResult;

				this.sessionTransactions.push({
					transactionHash: result.transactionHash,
					status: isBroadcastTxSuccess(result) ? TxStatus.SUCCEED : TxStatus.FAILED
				});

				this.sessionTxTableData._updateChangeSubscription();
				break;

			case 'searchedTx':
				result = result as IndexedTx[];

				result.forEach((tx: IndexedTx) => {
					this.searchedTransactions.push(
						{
							...tx,
							status: isBroadcastTxSuccess({...tx, transactionHash: tx.hash}) ? TxStatus.SUCCEED : TxStatus.FAILED
						}
					);
				});

				this.searchedTxTableData._updateChangeSubscription();
				break;

			default:
				throw new Error(LocalErrorTypes.UNKNOWN_TABLE_TYPE);
		}
	}

	/**
	 * Creates a new client interact with a Cosmos SDK blockchain
	 * @param memo - user Mnemonic
	 * @param address - user sender address
	 */
	private createClient(memo: string, address: string): Promise<SigningCosmosClient> {
		return new Promise<SigningCosmosClient>(async (resolve, reject) => {
			try {
				const wallet = await Secp256k1HdWallet.fromMnemonic(memo);

				resolve(new SigningCosmosClient(environment.cosmosEndpoint, address, wallet));
			}
			catch (err) {
				reject(err);
			}
		});
	}

	/**
	 * gets transaction fee based on it's denomination
	 * @param transactionDenominationType - transaction denomination type
	 */
	private getTxFee(transactionDenominationType: Denomination): StdFee {
		switch (transactionDenominationType) {
			case Denomination.UCOSM:
				return  {
					amount: coins(2000, Denomination.UCOSM),
					gas: '80000'
				};

			case Denomination.UTEST:
				return  {
					amount: coins(3000, Denomination.UTEST),
					gas: '80000'
				};

			default:
				throw new Error(LocalErrorTypes.UNKNOWN_DENOMINATION_TYPE);
		}
	}

	/**
	 * shows/hides the loading spinner
	 */
	private toggleLoading(): void {
		this.showLoading = !this.showLoading;
	}

	/**
	 * displays a snackbar to the user that contains a feedback message
	 */
	private displayFeedback(message: string): void {
		this.snackBar.open(message, 'OK', {
			duration: 2000,
		});
	}
}

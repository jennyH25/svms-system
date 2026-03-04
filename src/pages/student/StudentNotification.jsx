import React from 'react';
import AnimatedContent from '../../components/ui/AnimatedContent';
import Card from '../../components/ui/Card';

const notifications = [
	{
		title: 'Professor Lorem Ipsum',
		description: 'Lorem ipsum dolor sit amet consectetur. Eleifend condimentum mauris consequat tellus turpis vitae.',
		time: 'Just now',
	},
	{
		title: 'Professor Lorem Ipsum',
		description: 'Lorem ipsum dolor sit amet consectetur. Eleifend condimentum mauris consequat tellus turpis vitae.',
		time: 'Just now',
	},
	{
		title: 'Professor Lorem Ipsum',
		description: 'Lorem ipsum dolor sit amet consectetur. Eleifend condimentum mauris consequat tellus turpis vitae.',
		time: 'Just now',
	},
	{
		title: 'Professor Lorem Ipsum',
		description: 'Lorem ipsum dolor sit amet consectetur. Eleifend condimentum mauris consequat tellus turpis vitae.',
		time: 'Just now',
	},
	{
		title: 'Professor Lorem Ipsum',
		description: 'Lorem ipsum dolor sit amet consectetur. Eleifend condimentum mauris consequat tellus turpis vitae.',
		time: 'Just now',
	},
	{
		title: 'Professor Lorem Ipsum',
		description: 'Lorem ipsum dolor sit amet consectetur. Eleifend condimentum mauris consequat tellus turpis vitae.',
		time: 'Just now',
	},
	{
		title: 'Professor Lorem Ipsum',
		description: 'Lorem ipsum dolor sit amet consectetur. Eleifend condimentum mauris consequat tellus turpis vitae.',
		time: 'Just now',
	},
	{
		title: 'Professor Lorem Ipsum',
		description: 'Lorem ipsum dolor sit amet consectetur. Eleifend condimentum mauris consequat tellus turpis vitae.',
		time: 'Just now',
	},
	{
		title: 'Professor Lorem Ipsum',
		description: 'Lorem ipsum dolor sit amet consectetur. Eleifend condimentum mauris consequat tellus turpis vitae.',
		time: 'Just now',
	},
	{
		title: 'Professor Lorem Ipsum',
		description: 'Lorem ipsum dolor sit amet consectetur. Eleifend condimentum mauris consequat tellus turpis vitae.',
		time: 'Just now',
	},
];

const StudentNotification = () => {
	return (
		<AnimatedContent>
			<div className="flex flex-col gap-6">
				<h2 className="text-2xl font-bold text-white mb-1">NOTIFICATION</h2>
				<Card variant="glass" padding="lg" className="w-full">
					<div className="flex items-center justify-between mb-4">
						<h3 className="text-lg font-semibold text-white">&nbsp;</h3>
						<button className="text-gray-400 hover:text-white transition-colors">
							<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
								<circle cx="12" cy="12" r="1" />
								<circle cx="19" cy="12" r="1" />
								<circle cx="5" cy="12" r="1" />
							</svg>
						</button>
					</div>
					<div className="space-y-2">
						{notifications.map((note, idx) => (
							<div key={idx} className="bg-[#232528]/60 rounded-lg px-4 py-3 flex justify-between items-center border-b border-white/10">
								<div>
									<div className="font-bold text-white text-sm mb-1">{note.title}</div>
									<div className="text-gray-400 text-xs">{note.description}</div>
								</div>
								<div className="text-gray-500 text-xs font-medium">{note.time}</div>
							</div>
						))}
					</div>
				</Card>
			</div>
		</AnimatedContent>
	);
};

export default StudentNotification;
